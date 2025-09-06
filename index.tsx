/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from '@google/genai';

// Initialize with the correct environment variable as per guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const imageGenerationModel = 'imagen-4.0-generate-001';
const imageEditModel = 'gemini-2.5-flash-image-preview'; // aka 'nano-banana'

type ImageState = { data: string; mimeType: string; } | null;
type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

// --- State ---
let originalImageState: ImageState = null;
let editedImageState: ImageState = null;

// --- DOM Elements ---
const generationPromptInput = document.getElementById('generation-prompt') as HTMLTextAreaElement;
const editPromptInput = document.getElementById('edit-prompt') as HTMLTextAreaElement;
const aspectRatioSelect = document.getElementById('aspect-ratio') as HTMLSelectElement;
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const editButton = document.getElementById('edit-button') as HTMLButtonElement;
const originalWrapper = document.getElementById('original-image-wrapper');
const editedWrapper = document.getElementById('edited-image-wrapper');
const originalSaveContainer = document.getElementById('original-save-container');
const editedSaveContainer = document.getElementById('edited-save-container');


// --- Event Listeners ---
generateButton.addEventListener('click', handleGenerate);
editButton.addEventListener('click', handleEdit);

/**
 * Handles the image generation step.
 */
async function handleGenerate() {
  if (!originalWrapper || !editedWrapper || !originalSaveContainer || !editedSaveContainer) {
    console.error('Required DOM elements not found.');
    return;
  }

  const generationPrompt = generationPromptInput.value.trim();
  if (!generationPrompt) {
    alert('Please provide a description for the image you want to create.');
    return;
  }
  
  const aspectRatio = aspectRatioSelect.value as AspectRatio;

  // --- UI State: Loading ---
  setGenerateUIDisabled(true);
  originalImageState = null; // Reset state
  editedImageState = null;
  originalWrapper.innerHTML = '<p class="loading">Generating original image...</p>';
  editedWrapper.innerHTML = '';
  originalSaveContainer.innerHTML = '';
  editedSaveContainer.innerHTML = '';
  setEditUIDisabled(true, true); // Disable and lock edit UI

  try {
    // 1. Generate the initial image
    const generationResponse = await ai.models.generateImages({
      model: imageGenerationModel,
      prompt: generationPrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: aspectRatio,
      },
    });

    const originalImage = generationResponse.generatedImages?.[0];
    if (!originalImage?.image?.imageBytes) {
      throw new Error('Failed to generate the initial image.');
    }
    
    const originalImageBase64 = originalImage.image.imageBytes;
    const originalMimeType = originalImage.image.mimeType || 'image/jpeg';
    
    // Store image data for the edit and save steps
    originalImageState = { data: originalImageBase64, mimeType: originalMimeType };

    // 2. Display the original image and its prompt
    originalWrapper.innerHTML = ''; // Clear loading message
    const originalImg = document.createElement('img');
    originalImg.src = `data:${originalMimeType};base64,${originalImageBase64}`;
    originalImg.alt = generationPrompt;
    originalWrapper.appendChild(originalImg);
    
    const originalPromptP = document.createElement('p');
    originalPromptP.textContent = `Prompt: "${generationPrompt}"`;
    originalWrapper.appendChild(originalPromptP);

    // 3. Create a save button for the original image
    createSaveButton(originalSaveContainer, originalImageState, 'original-image');

    // 4. Enable the edit UI
    setEditUIDisabled(false);

  } catch (error) {
    console.error("An error occurred during generation:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    originalWrapper.innerHTML = `<p class="error">Error: ${errorMessage}<br>Check the developer console for more details.</p>`;
  } finally {
    // --- UI State: Idle ---
    setGenerateUIDisabled(false);
  }
}

/**
 * Handles the image editing step.
 */
async function handleEdit() {
  if (!editedWrapper || !editedSaveContainer) {
    console.error('Required DOM elements not found.');
    return;
  }
  if (!originalImageState) {
    alert('Please generate an image first before editing.');
    return;
  }

  const editPrompt = editPromptInput.value.trim();
  if (!editPrompt) {
    alert('Please provide a description of how you want to edit the image.');
    return;
  }

  // --- UI State: Loading ---
  setEditUIDisabled(true);
  editedImageState = null; // Reset state
  editedWrapper.innerHTML = '<p class="loading">Editing image with Nano Banana...</p>';
  editedSaveContainer.innerHTML = '';


  try {
    // 1. Edit the image using the stored data
    const editResponse = await ai.models.generateContent({
      model: imageEditModel,
      contents: {
        parts: [
          {
            inlineData: {
              data: originalImageState.data,
              mimeType: originalImageState.mimeType,
            },
          },
          { text: editPrompt },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });
    
    // 2. Process and display the edited image
    editedWrapper.innerHTML = ''; // Clear loading message
    
    const editPromptP = document.createElement('p');
    editPromptP.textContent = `Edit: "${editPrompt}"`;
    editedWrapper.appendChild(editPromptP);

    const parts = editResponse.candidates?.[0]?.content?.parts || [];
    let imageFound = false;

    for (const part of parts) {
      if (part.inlineData) {
        // Store edited image state
        editedImageState = { data: part.inlineData.data, mimeType: part.inlineData.mimeType };

        const editedImg = document.createElement('img');
        editedImg.src = `data:${editedImageState.mimeType};base64,${editedImageState.data}`;
        editedImg.alt = editPrompt;
        editedWrapper.prepend(editedImg); // Prepend to show image above prompt
        imageFound = true;

        // Create a save button for the edited image
        createSaveButton(editedSaveContainer, editedImageState, 'edited-image');

      } else if (part.text) {
        const textElement = document.createElement('p');
        textElement.textContent = part.text;
        editedWrapper.appendChild(textElement);
      }
    }

    if (!imageFound) {
      throw new Error('The model did not return an edited image.');
    }
  } catch(error) {
    console.error("An error occurred during editing:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    editedWrapper.innerHTML = `<p class="error">Error: ${errorMessage}<br>Check the developer console for more details.</p>`;
  } finally {
    // --- UI State: Idle ---
    setEditUIDisabled(false);
  }
}

/**
 * Creates and appends a save button to the specified container.
 * @param {HTMLElement} container - The container to append the button to.
 * @param {ImageState} imageState - The state object containing image data.
 * @param {string} filenamePrefix - The prefix for the downloaded file.
 */
function createSaveButton(container: HTMLElement, imageState: ImageState, filenamePrefix: string) {
  if (!imageState) return;
  
  container.innerHTML = ''; // Clear previous button
  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save Image';
  saveButton.className = 'save-button';
  saveButton.addEventListener('click', () => downloadImage(imageState, filenamePrefix));
  container.appendChild(saveButton);
}

/**
 * Triggers a browser download for the given image data.
 * @param {ImageState} imageState - The state object containing image data.
 * @param {string} filenamePrefix - The prefix for the downloaded file.
 */
function downloadImage(imageState: ImageState, filenamePrefix: string) {
  if (!imageState) return;

  const a = document.createElement('a');
  a.href = `data:${imageState.mimeType};base64,${imageState.data}`;
  const extension = imageState.mimeType.split('/')[1] || 'jpeg';
  a.download = `${filenamePrefix}-${Date.now()}.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


/**
 * Disables or enables the generation form elements.
 * @param {boolean} disabled - Whether to disable the form.
 */
function setGenerateUIDisabled(disabled: boolean) {
  generateButton.disabled = disabled;
  generationPromptInput.disabled = disabled;
  aspectRatioSelect.disabled = disabled;
  generateButton.textContent = disabled ? 'Generating...' : 'Generate Image';
}

/**
 * Disables or enables the edit form elements.
 * @param {boolean} disabled - Whether to disable the form.
 * @param {boolean} force - Ignores checks and forces a state. Used for reset.
 */
function setEditUIDisabled(disabled: boolean, force = false) {
    // Don't enable the edit button if there's no original image, unless forced.
    if (!disabled && !originalImageState && !force) return;
    
    editButton.disabled = disabled;
    editPromptInput.disabled = disabled;
    editButton.textContent = disabled ? 'Editing...' : 'Edit Image';
}