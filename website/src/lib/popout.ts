export interface PopoutOptions {
  width?: number;
  height?: number;
}

/**
 * Open `url` in a named popup window, then sever the opener reference
 * (noopener-equivalent security while keeping the window handle). An
 * already-open window of the same name is re-navigated to `url` and focused
 * (in-flight client state there is discarded). If the popup blocker
 * suppresses the window (`window.open` returns null), fall back to same-tab
 * navigation.
 */
export function openPopout(url: string, name: string, opts: PopoutOptions = {}): Window | null {
  const width = opts.width ?? 1100;
  const height = opts.height ?? 800;
  const win = window.open(url, name, `popup,width=${width},height=${height}`);
  if (win) {
    win.opener = null;
    win.focus();
    return win;
  }
  window.location.assign(url);
  return null;
}
