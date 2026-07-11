import '@testing-library/jest-dom';

// jsdom doesn't implement HTMLDialogElement.showModal()/close() — polyfill so any
// component test that mounts AdminModal/AdminDrawer (native <dialog>-based) doesn't
// throw. See openspec/changes/admin-ui-modal-drawer/notes.md for context.
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}
