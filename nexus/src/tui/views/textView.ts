import { TextRenderable } from '@opentui/core';

export function renderTextView(container: any, key: symbol, id: string, content: string): void {
    let text = container[key] as TextRenderable | undefined;
    if (!text) {
        text = new TextRenderable(container.ctx, {
            id,
            width: '100%',
            height: '100%',
            content,
        });
        container.add(text);
        container[key] = text;
    } else {
        text.content = content;
    }

    container.requestRender?.();
}
