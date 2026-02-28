export const IMAGE_PROMPTER_CONDITIONING_PROMPT = `I have a story that requires illustrations, and I would like to use an AI image generator to create them. Please help me draft prompts for the generator. I want the final output to be the story chapters with the image prompts embedded within code blocks like this:

\`\`\`image_prompt
...
\`\`\`

Note that I have conditioned the AI to recognize specific character names and places. Use them in your prompts whenever appropriate.

Do not overdo the number of images. Only include prompts for scenes that are visually rich or important to the story. Each prompt should be concise but descriptive, focusing on key visual elements, characters, and mood.

Output only the chapters with the included image prompts and nothing else.

Confirm that you understand this task, and I will then provide the story to you chapter by chapter.
`;

const IMAGE_GEN_PRECONDITION_PROMPT = `I want to create image generation for this story. I need a preconditioning prompt to send to the AI image generator to set up the tone, characters, and style of the images.

It should include sections with the following information:

- Setting (describe significant locations, items, and visual motifs that should be consistent across images)
- Tone (mood, color palette, lighting, etc.)
- Characters (facial features, typical clothing, accessories, etc.)

Preconditioning prompt should be concise but descriptive.

Return only the preconditioning prompt text. Do not include extra explanation.

Full story:
`;

export function buildImagePreconditionPrompt(story: string): string {
    return IMAGE_GEN_PRECONDITION_PROMPT + '\n\n' + story;
}

export const IMAGE_GEN_PRECONDITION_SETUP_PROMPT = `I want to create image generation for this story. I will provide you the image generation prompts one by one. Only generate one image per prompt.

First understand the precondition below and confirm that you are ready to receive the prompts.

`;
