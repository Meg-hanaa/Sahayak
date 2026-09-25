/**
 * Production Clipboard Utility
 * Handles modern navigator.clipboard writing with a robust, focus-preserving
 * textarea fallback and guaranteed try/finally resource cleanup.
 */

export interface CopyToClipboardResult {
  success: boolean;
  method: 'clipboard-api' | 'exec-command' | 'failed';
}

export async function copyTextToClipboard(
  text: string,
  options?: {
    activeElement?: HTMLElement | null;
  }
): Promise<CopyToClipboardResult> {
  // 1. Modern Clipboard API in secure contexts
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function' &&
    typeof window !== 'undefined' &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return { success: true, method: 'clipboard-api' };
    } catch {
      // Fall through to legacy fallback on permission denial or API failure
    }
  }

  // 2. Legacy execCommand fallback
  if (typeof document === 'undefined') {
    return { success: false, method: 'failed' };
  }

  const previouslyFocused =
    options?.activeElement !== undefined
      ? options.activeElement
      : (document.activeElement as HTMLElement | null);

  let textArea: HTMLTextAreaElement | null = null;

  try {
    textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const success = document.execCommand('copy');
    return {
      success: Boolean(success),
      method: success ? 'exec-command' : 'failed',
    };
  } catch {
    return { success: false, method: 'failed' };
  } finally {
    // Guaranteed cleanup even if execCommand throws
    if (textArea && textArea.parentNode) {
      textArea.parentNode.removeChild(textArea);
    }
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try {
        previouslyFocused.focus();
      } catch {
        // ignore focus errors
      }
    }
  }
}
