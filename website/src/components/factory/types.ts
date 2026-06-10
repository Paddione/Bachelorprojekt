export interface FactoryTicket {
  id: string;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  phase?: string;
  assignee?: string;
  updatedAt?: string;
}
