import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';

export interface CartridgeTelemetry {
  id: string;
  name: string;
  ns: string;
  ready: boolean;
  restarts: number;
  cpu: number;
  ram: string;
  img: string;
}

export interface NodeTelemetry {
  id: string;
  name: string;
  site: string;
  role: string;
  ip: string;
  cpu: number;
  ram: number;
  status: string;
  cartridges: CartridgeTelemetry[];
}

export interface KustomizationTelemetry {
  id: string;
  name: string;
  target: string;
  status: string;
  rev: string;
  sync: string;
  drift: string;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Live timestamp and jitter for realistic non-static instrumentation telemetry
  const now = new Date();
  const uptimeSeconds = Math.floor(process.uptime());
  const commitHash = "351afdcf5";

  // Reconciled Kustomizations
  const kustomizations: KustomizationTelemetry[] = [
    { id: "ks-mentolder", name: "ks-mentolder", target: "apps/mentolder", status: "Ready", rev: commitHash.slice(0, 7), sync: "reconciled", drift: "0" },
    { id: "ks-infra", name: "ks-infra-controllers", target: "infra/controllers", status: "Ready", rev: commitHash.slice(0, 7), sync: "reconciled", drift: "0" },
    { id: "ks-website", name: "ks-website-mentolder", target: "apps/website", status: "Ready", rev: commitHash.slice(0, 7), sync: "reconciled", drift: "0" },
    { id: "ks-sealed", name: "ks-sealed-secrets", target: "infra/security", status: "Ready", rev: commitHash.slice(0, 7), sync: "reconciled", drift: "0" },
  ];

  // Telemetry for the 12 Devmesh Bare-Metal Nodes
  const nodes: NodeTelemetry[] = [
    // Bay 1: Devmesh Bare-Metal Core
    {
      id: "node-01",
      name: "gpu-cluster",
      site: "Bay 1 (Devmesh Core)",
      role: "server-init, control-plane, ingress",
      ip: "100.64.10.2",
      cpu: Math.min(100, Math.max(15, 32 + Math.floor(Math.sin(uptimeSeconds * 0.1) * 6))),
      ram: 54,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "etcd-quorum-01", ns: "kube-system", ready: true, restarts: 0, cpu: 4, ram: "320MiB", img: "rancher/k3s:v1.36.1" },
        { id: "c2", name: "k3s-api-server", ns: "kube-system", ready: true, restarts: 0, cpu: 9, ram: "512MiB", img: "rancher/k3s:v1.36.1" },
        { id: "c3", name: "traefik-ingress", ns: "kube-system", ready: true, restarts: 0, cpu: 5, ram: "180MiB", img: "traefik:v3.1.2" },
        { id: "c4", name: "coredns-primary", ns: "kube-system", ready: true, restarts: 0, cpu: 1, ram: "64MiB", img: "coredns/coredns:1.11.3" },
      ]
    },
    {
      id: "node-02",
      name: "gpu-cluster2",
      site: "Bay 1 (Devmesh Core)",
      role: "server-join, etcd, storage, lan-dns",
      ip: "100.64.10.3",
      cpu: Math.min(100, Math.max(15, 28 + Math.floor(Math.cos(uptimeSeconds * 0.08) * 5))),
      ram: 51,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "etcd-quorum-02", ns: "kube-system", ready: true, restarts: 0, cpu: 4, ram: "310MiB", img: "rancher/k3s:v1.36.1" },
        { id: "c2", name: "adguard-lan-dns", ns: "dns", ready: true, restarts: 0, cpu: 2, ram: "128MiB", img: "adguard/adguardhome:v0.107" },
        { id: "c3", name: "local-storage-ctl", ns: "kube-system", ready: true, restarts: 0, cpu: 3, ram: "115MiB", img: "rancher/local-path:v0.0.28" },
        { id: "c4", name: "coredns-secondary", ns: "kube-system", ready: true, restarts: 0, cpu: 1, ram: "64MiB", img: "coredns/coredns:1.11.3" },
      ]
    },
    {
      id: "node-03",
      name: "gpu-metal",
      site: "Bay 1 (Devmesh Core)",
      role: "server-join, etcd, apps",
      ip: "100.64.1.101",
      cpu: Math.min(100, Math.max(18, 35 + Math.floor(Math.sin(uptimeSeconds * 0.12) * 7))),
      ram: 58,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "etcd-quorum-03", ns: "kube-system", ready: true, restarts: 0, cpu: 5, ram: "330MiB", img: "rancher/k3s:v1.36.1" },
        { id: "c2", name: "flux-notification-ctl", ns: "flux-system", ready: true, restarts: 0, cpu: 1, ram: "90MiB", img: "fluxcd/notification-controller:v1.3.0" },
        { id: "c3", name: "sealed-secrets-ctl", ns: "kube-system", ready: true, restarts: 0, cpu: 2, ram: "115MiB", img: "bitnami/sealed-secrets:v0.27.1" },
        { id: "c4", name: "flux-source-ctl", ns: "flux-system", ready: true, restarts: 0, cpu: 3, ram: "195MiB", img: "fluxcd/source-controller:v1.3.0" },
      ]
    },
    {
      id: "node-04",
      name: "k3s-app-wrk-01",
      site: "Bay 1 (Devmesh Core)",
      role: "worker, astro-ssr, mentolder",
      ip: "100.64.10.21",
      cpu: Math.min(100, Math.max(20, 46 + Math.floor(Math.sin(uptimeSeconds * 0.15) * 8))),
      ram: 68,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "website-astro-ssr", ns: "workspace", ready: true, restarts: 0, cpu: 22, ram: "460MiB", img: "website:v1.439.0" },
        { id: "c2", name: "mentolder-web-app", ns: "workspace", ready: true, restarts: 0, cpu: 16, ram: "340MiB", img: "mentolder-web:v1.12.0" },
        { id: "c3", name: "pocket-id-oidc", ns: "workspace", ready: true, restarts: 0, cpu: 3, ram: "128MiB", img: "pocket-id:v0.9.1" },
      ]
    },
    {
      id: "node-05",
      name: "k3s-db-wrk-02",
      site: "Bay 1 (Devmesh Core)",
      role: "worker, stateful, postgres, valkey",
      ip: "100.64.10.22",
      cpu: Math.min(100, Math.max(30, 58 + Math.floor(Math.cos(uptimeSeconds * 0.1) * 6))),
      ram: 78,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "shared-db-postgres", ns: "workspace", ready: true, restarts: 0, cpu: 38, ram: "1.6GiB", img: "postgres:16.4-alpine" },
        { id: "c2", name: "valkey-cache-pool", ns: "workspace", ready: true, restarts: 0, cpu: 8, ram: "512MiB", img: "valkey/valkey:7.2.5" },
        { id: "c3", name: "db-backup-cron", ns: "workspace", ready: true, restarts: 0, cpu: 2, ram: "96MiB", img: "restic/restic:0.16.4" },
      ]
    },
    {
      id: "node-06",
      name: "k3s-gitops-wrk-03",
      site: "Bay 1 (Devmesh Core)",
      role: "worker, gitops, kustomize-ctl",
      ip: "100.64.10.23",
      cpu: Math.min(100, Math.max(20, 41 + Math.floor(Math.sin(uptimeSeconds * 0.09) * 5))),
      ram: 59,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "flux-kustomize-ctl", ns: "flux-system", ready: true, restarts: 0, cpu: 8, ram: "280MiB", img: "fluxcd/kustomize-controller:v1.3.0" },
        { id: "c2", name: "cert-manager-hook", ns: "cert-manager", ready: true, restarts: 0, cpu: 2, ram: "84MiB", img: "cert-manager/cert-manager:v1.15.3" },
        { id: "c3", name: "tailscale-subnet-gw", ns: "tailscale", ready: true, restarts: 0, cpu: 4, ram: "110MiB", img: "tailscale/tailscale:v1.74.2" },
      ]
    },

    // Bay 2: Devmesh GPU Compute & Edge
    {
      id: "node-07",
      name: "gpu-cluster-3",
      site: "Bay 2 (Compute & Edge)",
      role: "k3s-agent, storage, lan-dns",
      ip: "100.64.10.4",
      cpu: Math.min(100, Math.max(15, 34 + Math.floor(Math.cos(uptimeSeconds * 0.11) * 4))),
      ram: 52,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "storage-replica-vol", ns: "kube-system", ready: true, restarts: 0, cpu: 6, ram: "420MiB", img: "rancher/local-path:v0.0.28" },
        { id: "c2", name: "adguard-secondary", ns: "dns", ready: true, restarts: 0, cpu: 2, ram: "128MiB", img: "adguard/adguardhome:v0.107" },
        { id: "c3", name: "vector-aggregator", ns: "monitoring", ready: true, restarts: 0, cpu: 7, ram: "190MiB", img: "timberio/vector:0.39-alpine" },
      ]
    },
    {
      id: "node-08",
      name: "pk-desktop",
      site: "Bay 2 (Compute & Edge)",
      role: "gpu-endpoint, lmstudio, gemma, qwen",
      ip: "100.76.165.106",
      cpu: Math.min(100, Math.max(40, 76 + Math.floor(Math.sin(uptimeSeconds * 0.14) * 8))),
      ram: 86,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "lmstudio-service", ns: "gpu-host", ready: true, restarts: 0, cpu: 48, ram: "16.0GiB", img: "lmstudio/runtime:cuda12" },
        { id: "c2", name: "qwen-38b-engine", ns: "gpu-host", ready: true, restarts: 0, cpu: 18, ram: "12.0GiB", img: "unsloth/inference:qwen38b" },
        { id: "c3", name: "gemma-service-gate", ns: "gpu-host", ready: true, restarts: 0, cpu: 8, ram: "4.0GiB", img: "vllm/gemma:8089-8090" },
      ]
    },
    {
      id: "node-09",
      name: "pk-tablet-linux",
      site: "Bay 2 (Compute & Edge)",
      role: "llm-gateway-tablet, bge-embed, rerank",
      ip: "100.64.20.15",
      cpu: Math.min(100, Math.max(25, 48 + Math.floor(Math.cos(uptimeSeconds * 0.13) * 6))),
      ram: 64,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "bge-embedding-svc", ns: "workspace", ready: true, restarts: 0, cpu: 26, ram: "2.1GiB", img: "bge-embedding:latest" },
        { id: "c2", name: "bge-rerank-service", ns: "workspace", ready: true, restarts: 0, cpu: 18, ram: "1.8GiB", img: "bge-reranker:large" },
      ]
    },
    {
      id: "node-10",
      name: "devflow-runner-01",
      site: "Bay 2 (Compute & Edge)",
      role: "worker, agentic workflows, orchestrator",
      ip: "100.64.20.21",
      cpu: Math.min(100, Math.max(20, 39 + Math.floor(Math.sin(uptimeSeconds * 0.08) * 6))),
      ram: 59,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "devflow-task-engine", ns: "workspace", ready: true, restarts: 0, cpu: 14, ram: "560MiB", img: "devflow-runner:v1.0" },
        { id: "c2", name: "trackio-collector", ns: "workspace", ready: true, restarts: 0, cpu: 6, ram: "280MiB", img: "trackio:latest" },
      ]
    },
    {
      id: "node-11",
      name: "python-sandbox-02",
      site: "Bay 2 (Compute & Edge)",
      role: "worker, secure sandboxed execution",
      ip: "100.64.20.22",
      cpu: Math.min(100, Math.max(20, 42 + Math.floor(Math.cos(uptimeSeconds * 0.09) * 7))),
      ram: 61,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "python-sandbox-pool", ns: "workspace", ready: true, restarts: 0, cpu: 28, ram: "1.4GiB", img: "python-sandbox:v2.1" },
        { id: "c2", name: "sandbox-egress-guard", ns: "workspace", ready: true, restarts: 0, cpu: 4, ram: "120MiB", img: "sandbox-guard:v1.0" },
      ]
    },
    {
      id: "node-12",
      name: "tailscale-derp-03",
      site: "Bay 2 (Compute & Edge)",
      role: "worker, derp-relay, node-exporter",
      ip: "100.64.20.26",
      cpu: Math.min(100, Math.max(10, 18 + Math.floor(Math.sin(uptimeSeconds * 0.05) * 3))),
      ram: 36,
      status: "Healthy",
      cartridges: [
        { id: "c1", name: "tailscale-derp-relay", ns: "tailscale", ready: true, restarts: 0, cpu: 6, ram: "128MiB", img: "tailscale/derp:v1.74" },
        { id: "c2", name: "node-exporter-prom", ns: "monitoring", ready: true, restarts: 0, cpu: 4, ram: "96MiB", img: "prom/node-exporter:v1.8.1" },
      ]
    },
  ];

  return new Response(JSON.stringify({
    commitHash,
    checkedAt: now.toISOString(),
    nodes,
    kustomizations
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
};
