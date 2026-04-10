export async function analyzeSchematic(base64Image) {
    const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        body: JSON.stringify({
            model: 'gemma4',
            prompt: 'Analyze this electrical schematic and identify the components and any potential issues.',
            images: [base64Image],
            stream: false
        })
    });
    return await response.json();
}
