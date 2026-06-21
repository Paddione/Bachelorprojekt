function MockSvg({
  className,
  'aria-hidden': ariaHidden,
}: {
  className?: string;
  'aria-hidden'?: boolean;
}) {
  return (
    <svg
      className={className}
      aria-hidden={ariaHidden}
      data-testid="svg-mock"
    />
  );
}

export type { };

MockSvg.displayName = 'MockSvg';

export default MockSvg;
