import type { ReactNode, ComponentType, SVGProps } from 'react';
import { iconRegistry, iconLabels, type IconName } from './icons';
import { ServiceCard } from './ServiceCard';

export interface Service {
  id: string;
  title: string;
  description: string;
  features: string[];
  price: string;
  priceUnit?: string;
  href: string;
  icon: IconName;
}

interface ServiceRowProps {
  services: Service[];
}

export function ServiceRow({ services }: ServiceRowProps) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
      role="list"
      aria-label="Angebote"
    >
      {services.map((service) => {
        const Icon = iconRegistry[service.icon] as ComponentType<SVGProps<SVGSVGElement> & { title?: string }>;
        const label = iconLabels[service.icon];
        const priceMain = service.priceUnit ? service.price : service.price.split('/').map((s) => s.trim())[0];
        const displayPrice = service.priceUnit ? `${priceMain} / ${service.priceUnit}` : service.price;
        return (
          <div role="listitem" key={service.id}>
            <ServiceCard
              icon={<Icon className="w-6 h-6" aria-hidden="true" focusable="false" />}
              title={service.title}
              description={service.description}
              features={service.features}
              price={displayPrice}
              href={service.href}
            />
            <span className="sr-only">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export type { ServiceRowProps };
export { ServiceRow as default };
export type { Service as ServiceItem };
export type { ReactNode };
