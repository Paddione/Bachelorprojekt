// @ts-nocheck
// Authored preview — mentolder cookie-consent banner (necessary-cookies only).
// NOTE: this component takes NO props. Its onMount reads localStorage[cookie_consent_v1]
// and only sets visible=true when NO consent has been stored yet. In a fresh preview frame
// localStorage is usually empty, so the banner SHOULD render. If the preview frame has a
// stored consent value, it will render EMPTY (no force-show prop exists) — orchestrator may
// need a floor card / localStorage clear.
export const Default = () => {
  const { CookieConsent } = window.MentolderDS;
  return <CookieConsent />;
};
