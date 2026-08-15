// Design System bundle entry — used by /design-sync converter only.
// Exports all public components + MemoryRouter as the routing provider.
export { Hero } from './components/Hero';
export { ServiceCard } from './components/ServiceCard';
export { ServiceRow } from './components/ServiceRow';
export { WhyMeStats } from './components/WhyMeStats';
export { FAQ } from './components/FAQ';
export { ContactForm } from './components/ContactForm';
export { Footer } from './components/Footer';
export { KickerBar } from './components/KickerBar';
export { Navigation } from './components/Navigation';
export { Portrait } from './components/Portrait';
export { CallToAction } from './components/CallToAction';
// Router provider — required because Hero/Navigation/ServiceRow/etc. use <Link>
export { MemoryRouter } from 'react-router-dom';
