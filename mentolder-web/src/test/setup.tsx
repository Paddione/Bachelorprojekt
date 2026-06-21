import '@testing-library/jest-dom';

vi.mock('*.svg?react', () => {
  const MockSvg = ({ className, 'aria-hidden': ariaHidden }: { className?: string; 'aria-hidden'?: boolean; focusable?: string }) =>
    <svg className={className} aria-hidden={ariaHidden} data-testid="svg-mock" />;
  MockSvg.displayName = 'MockSvg';
  return { default: MockSvg };
});
