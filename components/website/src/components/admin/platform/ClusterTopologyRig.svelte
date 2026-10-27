<script lang="ts">
  interface CartridgeItem {
    id: string;
    name: string;
    ns: string;
    ready: boolean;
    restarts: number;
    cpu: number;
    ram: string;
    img: string;
  }

  interface NodeItem {
    id: string;
    name: string;
    site: string;
    role: string;
    ip: string;
    cpu: number;
    ram: number;
    status: string;
    cartridges: CartridgeItem[];
  }

  interface KustomizationItem {
    id: string;
    name: string;
    target: string;
    status: string;
    rev: string;
    sync: string;
    drift: string;
  }

  interface Props {
    title?: string;
    commitHash?: string;
  }

  let {
    title = "Fig. 1 // Bare-Metal Devmesh & GPU Rig (12 Nodes / Tailscale Overlay)",
    commitHash = "0588ed7"
  }: Props = $props();

  const kustomizations: KustomizationItem[] = [
  {
    "id": "ks-mentolder",
    "name": "ks-mentolder",
    "target": "apps/mentolder",
    "status": "Ready",
    "rev": "0588ed7",
    "sync": "1m ago",
    "drift": "0"
  },
  {
    "id": "ks-infra",
    "name": "ks-infra-controllers",
    "target": "infra/controllers",
    "status": "Ready",
    "rev": "0588ed7",
    "sync": "3m ago",
    "drift": "0"
  },
  {
    "id": "ks-website",
    "name": "ks-website-mentolder",
    "target": "apps/website",
    "status": "Ready",
    "rev": "0588ed7",
    "sync": "1m ago",
    "drift": "0"
  },
  {
    "id": "ks-sealed",
    "name": "ks-sealed-secrets",
    "target": "infra/security",
    "status": "Ready",
    "rev": "0588ed7",
    "sync": "6m ago",
    "drift": "0"
  }
];

  const nodes: Record<string, NodeItem> = {
    "node-01": {"id":"node-01","name":"gpu-cluster","site":"Bay 1 (Devmesh Core)","role":"server-init, control-plane, ingress","ip":"100.64.10.2","cpu":32,"ram":54,"status":"Healthy","cartridges":[{"id":"c1","name":"etcd-quorum-01","ns":"kube-system","ready":true,"restarts":0,"cpu":4,"ram":"320MiB","img":"rancher/k3s:v1.36.1"},{"id":"c2","name":"k3s-api-server","ns":"kube-system","ready":true,"restarts":0,"cpu":9,"ram":"512MiB","img":"rancher/k3s:v1.36.1"},{"id":"c3","name":"traefik-ingress","ns":"kube-system","ready":true,"restarts":0,"cpu":5,"ram":"180MiB","img":"traefik:v3.1.2"},{"id":"c4","name":"coredns-primary","ns":"kube-system","ready":true,"restarts":0,"cpu":1,"ram":"64MiB","img":"coredns/coredns:1.11.3"}]},
    "node-02": {"id":"node-02","name":"gpu-cluster2","site":"Bay 1 (Devmesh Core)","role":"server-join, etcd, storage, lan-dns","ip":"100.64.10.3","cpu":28,"ram":51,"status":"Healthy","cartridges":[{"id":"c1","name":"etcd-quorum-02","ns":"kube-system","ready":true,"restarts":0,"cpu":4,"ram":"310MiB","img":"rancher/k3s:v1.36.1"},{"id":"c2","name":"adguard-lan-dns","ns":"dns","ready":true,"restarts":0,"cpu":2,"ram":"128MiB","img":"adguard/adguardhome:v0.107"},{"id":"c3","name":"local-storage-ctl","ns":"kube-system","ready":true,"restarts":0,"cpu":3,"ram":"115MiB","img":"rancher/local-path:v0.0.28"},{"id":"c4","name":"coredns-secondary","ns":"kube-system","ready":true,"restarts":0,"cpu":1,"ram":"64MiB","img":"coredns/coredns:1.11.3"}]},
    "node-03": {"id":"node-03","name":"gpu-metal","site":"Bay 1 (Devmesh Core)","role":"server-join, etcd, apps","ip":"100.64.1.101","cpu":35,"ram":58,"status":"Healthy","cartridges":[{"id":"c1","name":"etcd-quorum-03","ns":"kube-system","ready":true,"restarts":0,"cpu":5,"ram":"330MiB","img":"rancher/k3s:v1.36.1"},{"id":"c2","name":"flux-notification-ctl","ns":"flux-system","ready":true,"restarts":0,"cpu":1,"ram":"90MiB","img":"fluxcd/notification-controller:v1.3.0"},{"id":"c3","name":"sealed-secrets-ctl","ns":"kube-system","ready":true,"restarts":0,"cpu":2,"ram":"115MiB","img":"bitnami/sealed-secrets:v0.27.1"},{"id":"c4","name":"flux-source-ctl","ns":"flux-system","ready":true,"restarts":0,"cpu":3,"ram":"195MiB","img":"fluxcd/source-controller:v1.3.0"}]},
    "node-04": {"id":"node-04","name":"k3s-app-wrk-01","site":"Bay 1 (Devmesh Core)","role":"worker, astro-ssr, mentolder","ip":"100.64.10.21","cpu":46,"ram":68,"status":"Healthy","cartridges":[{"id":"c1","name":"website-astro-ssr","ns":"workspace","ready":true,"restarts":0,"cpu":22,"ram":"460MiB","img":"website:v1.439.0"},{"id":"c2","name":"mentolder-web-app","ns":"workspace","ready":true,"restarts":0,"cpu":16,"ram":"340MiB","img":"mentolder-web:v1.12.0"},{"id":"c3","name":"pocket-id-oidc","ns":"workspace","ready":true,"restarts":0,"cpu":3,"ram":"128MiB","img":"pocket-id:v0.9.1"}]},
    "node-05": {"id":"node-05","name":"k3s-db-wrk-02","site":"Bay 1 (Devmesh Core)","role":"worker, stateful, postgres, valkey","ip":"100.64.10.22","cpu":58,"ram":78,"status":"Healthy","cartridges":[{"id":"c1","name":"shared-db-postgres","ns":"workspace","ready":true,"restarts":0,"cpu":38,"ram":"1.6GiB","img":"postgres:16.4-alpine"},{"id":"c2","name":"valkey-cache-pool","ns":"workspace","ready":true,"restarts":0,"cpu":8,"ram":"512MiB","img":"valkey/valkey:7.2.5"},{"id":"c3","name":"db-backup-cron","ns":"workspace","ready":true,"restarts":0,"cpu":2,"ram":"96MiB","img":"restic/restic:0.16.4"}]},
    "node-06": {"id":"node-06","name":"k3s-gitops-wrk-03","site":"Bay 1 (Devmesh Core)","role":"worker, gitops, kustomize-ctl","ip":"100.64.10.23","cpu":41,"ram":59,"status":"Healthy","cartridges":[{"id":"c1","name":"flux-kustomize-ctl","ns":"flux-system","ready":true,"restarts":0,"cpu":8,"ram":"280MiB","img":"fluxcd/kustomize-controller:v1.3.0"},{"id":"c2","name":"cert-manager-hook","ns":"cert-manager","ready":true,"restarts":0,"cpu":2,"ram":"84MiB","img":"cert-manager/cert-manager:v1.15.3"},{"id":"c3","name":"tailscale-subnet-gw","ns":"tailscale","ready":true,"restarts":0,"cpu":4,"ram":"110MiB","img":"tailscale/tailscale:v1.74.2"}]},
    "node-07": {"id":"node-07","name":"gpu-cluster-3","site":"Bay 2 (Compute & Edge)","role":"k3s-agent, storage, lan-dns","ip":"100.64.10.4","cpu":34,"ram":52,"status":"Healthy","cartridges":[{"id":"c1","name":"storage-replica-vol","ns":"kube-system","ready":true,"restarts":0,"cpu":6,"ram":"420MiB","img":"rancher/local-path:v0.0.28"},{"id":"c2","name":"adguard-secondary","ns":"dns","ready":true,"restarts":0,"cpu":2,"ram":"128MiB","img":"adguard/adguardhome:v0.107"},{"id":"c3","name":"vector-aggregator","ns":"monitoring","ready":true,"restarts":0,"cpu":7,"ram":"190MiB","img":"timberio/vector:0.39-alpine"}]},
    "node-08": {"id":"node-08","name":"pk-desktop","site":"Bay 2 (Compute & Edge)","role":"gpu-endpoint, lmstudio, gemma, qwen","ip":"100.76.165.106","cpu":76,"ram":86,"status":"Healthy","cartridges":[{"id":"c1","name":"lmstudio-service","ns":"gpu-host","ready":true,"restarts":0,"cpu":48,"ram":"16.0GiB","img":"lmstudio/runtime:cuda12"},{"id":"c2","name":"qwen-38b-engine","ns":"gpu-host","ready":true,"restarts":0,"cpu":18,"ram":"12.0GiB","img":"unsloth/inference:qwen38b"},{"id":"c3","name":"gemma-service-gate","ns":"gpu-host","ready":true,"restarts":0,"cpu":8,"ram":"4.0GiB","img":"vllm/gemma:8089-8090"}]},
    "node-09": {"id":"node-09","name":"pk-tablet-linux","site":"Bay 2 (Compute & Edge)","role":"llm-gateway-tablet, bge-embed, rerank","ip":"100.64.20.15","cpu":48,"ram":64,"status":"Healthy","cartridges":[{"id":"c1","name":"bge-embedding-svc","ns":"workspace","ready":true,"restarts":0,"cpu":26,"ram":"2.1GiB","img":"bge-embedding:latest"},{"id":"c2","name":"bge-rerank-service","ns":"workspace","ready":true,"restarts":0,"cpu":18,"ram":"1.8GiB","img":"bge-reranker:large"}]},
    "node-10": {"id":"node-10","name":"devflow-runner-01","site":"Bay 2 (Compute & Edge)","role":"worker, agentic workflows, orchestrator","ip":"100.64.20.21","cpu":39,"ram":59,"status":"Healthy","cartridges":[{"id":"c1","name":"devflow-task-engine","ns":"workspace","ready":true,"restarts":0,"cpu":14,"ram":"560MiB","img":"devflow-runner:v1.0"},{"id":"c2","name":"trackio-collector","ns":"workspace","ready":true,"restarts":0,"cpu":6,"ram":"280MiB","img":"trackio:latest"}]},
    "node-11": {"id":"node-11","name":"python-sandbox-02","site":"Bay 2 (Compute & Edge)","role":"worker, secure sandboxed execution","ip":"100.64.20.22","cpu":42,"ram":61,"status":"Healthy","cartridges":[{"id":"c1","name":"python-sandbox-pool","ns":"workspace","ready":true,"restarts":0,"cpu":28,"ram":"1.4GiB","img":"python-sandbox:v2.1"},{"id":"c2","name":"sandbox-egress-guard","ns":"workspace","ready":true,"restarts":0,"cpu":4,"ram":"120MiB","img":"sandbox-guard:v1.0"}]},
    "node-12": {"id":"node-12","name":"tailscale-derp-03","site":"Bay 2 (Compute & Edge)","role":"worker, derp-relay, node-exporter","ip":"100.64.20.26","cpu":18,"ram":36,"status":"Healthy","cartridges":[{"id":"c1","name":"tailscale-derp-relay","ns":"tailscale","ready":true,"restarts":0,"cpu":6,"ram":"128MiB","img":"tailscale/derp:v1.74"},{"id":"c2","name":"node-exporter-prom","ns":"monitoring","ready":true,"restarts":0,"cpu":4,"ram":"96MiB","img":"prom/node-exporter:v1.8.1"}]},
  };

  let selectedId = $state<string>("node-01");
  let selected = $derived(nodes[selectedId] || nodes["node-01"]);

  function selectNode(e: MouseEvent | KeyboardEvent) {
    const target = (e.target as Element).closest("[data-node-id]");
    if (target) {
      const id = target.getAttribute("data-node-id");
      if (id && nodes[id]) {
        selectedId = id;
      }
    }
  }
</script>

<div class="rig-card">
  <!-- Instrument Header -->
  <div class="rig-header">
    <div class="rig-title-block">
      <span class="rig-title">{title}</span>
      <span class="rig-sub">ISOMETRIC 30° / MECHANICAL RIG ENCLOSURE / TAILSCALE OVERLAY</span>
    </div>
    <div class="rig-badges">
      <div class="rig-badge mesh">
        <span class="badge-dot pulse-ts"></span>
        <span class="badge-label">TAILSCALE MESH</span>
        <span class="badge-val">100.64.0.0/10</span>
      </div>
      <div class="rig-badge gitops">
        <span class="badge-dot pulse-git"></span>
        <span class="badge-label">FLUX GITOPS</span>
        <span class="badge-val">rev:{commitHash}</span>
      </div>
    </div>
  </div>

  <!-- GitOps Kustomization Instrument Bar -->
  <div class="kustomization-bar">
    <div class="kustomization-header">
      <span class="k-bar-title">FLUX KUSTOMIZATION REGISTER</span>
      <span class="k-bar-rev">REVISION {commitHash} · 4 RECONCILED · 0 DRIFT</span>
    </div>
    <div class="k-tiles">
      {#each kustomizations as k}
        <div class="k-tile">
          <div class="k-tile-top">
            <span class="k-dot"></span>
            <span class="k-name">{k.name}</span>
          </div>
          <div class="k-meta">
            <span class="k-target">{k.target}</span>
            <span class="k-sync">{k.sync}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- SVG Stage -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="rig-stage" onclick={selectNode}>
    <svg class="cluster-rig-svg" viewBox="0 0 920 560" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
<defs>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
<path class="iso-halo" d="M177.1 297.5L177.1 296.1L177.8 294.8L179 293.5L180.7 292.4L182.8 291.4L379.5 219.3L382 218.5L384.7 218L387.7 217.8L390.6 217.8L393.5 218.1L396.2 218.7L398.6 219.5L400.6 220.5L739.8 424.3L741.4 425.4L742.4 426.7L742.9 428.1L742.9 441.4L742.9 442.8L742.2 444.1L741 445.4L739.3 446.5L737.2 447.5L540.5 519.6L538 520.4L535.3 520.9L532.3 521.1L529.4 521.1L526.5 520.8L523.8 520.2L521.4 519.4L519.4 518.4L180.2 314.6L178.6 313.5L177.6 312.2L177.1 310.8Z"/>
<g class="iso-solid"><path class="iso-fill" d="M375.2 242.2L375.9 240.8L377.5 239.5L379.6 238.5L382.3 237.7L385.3 237.3L388.4 237.3L391.4 237.7L394 238.4L396.2 239.4L397.8 240.7L398.6 242.1L398.7 243.5L398.7 245.9L397.9 247.3L396.4 248.6L394.2 249.6L391.5 250.3L388.6 250.7L385.5 250.7L382.5 250.4L379.8 249.7L377.6 248.6L376 247.4L375.2 246L375.2 244.5Z"/><path class="iso-shade" data-shade="0" d="M394.2 249.6L391.5 250.3L391.5 248L394.2 247.2ZM398.7 245.9L397.9 247.3L397.9 244.9L398.7 243.5ZM397.9 247.3L396.4 248.6L396.4 246.2L397.9 244.9ZM396.4 248.6L394.2 249.6L394.2 247.2L396.4 246.2Z"/><path class="iso-shade" data-shade="1" d="M391.5 250.3L388.6 250.7L388.6 248.3L391.5 248ZM388.6 250.7L385.5 250.7L385.5 248.4L388.6 248.3Z"/><path class="iso-shade" data-shade="2" d="M385.5 250.7L382.5 250.4L382.5 248L385.5 248.4ZM382.5 250.4L379.8 249.7L379.8 247.3L382.5 248Z"/><path class="iso-shade" data-shade="3" d="M379.8 249.7L377.6 248.6L377.6 246.3L379.8 247.3ZM377.6 248.6L376 247.4L376 245L377.6 246.3ZM376 247.4L375.2 246L375.2 243.6L376 245ZM375.2 246L375.2 244.5L375.2 242.2L375.2 243.6Z"/><path class="iso-top" d="M394.2 247.2L391.5 248L388.6 248.3L385.5 248.4L382.5 248L379.8 247.3L377.6 246.3L376 245L375.2 243.6L375.2 242.2L375.9 240.8L377.5 239.5L379.6 238.5L382.3 237.7L385.3 237.3L388.4 237.3L391.4 237.7L394 238.4L396.2 239.4L397.8 240.7L398.6 242.1L398.7 243.5L397.9 244.9L396.4 246.2Z"/><path class="iso-line iso-crease" data-tone="faint" d="M398.7 243.5L397.9 244.9L396.4 246.2L394.2 247.2L391.5 248L388.6 248.3L385.5 248.4L382.5 248L379.8 247.3L377.6 246.3L376 245L375.2 243.6L375.2 242.2"/><path class="iso-line iso-edge" data-tone="lo" d="M375.2 242.2L375.9 240.8L377.5 239.5L379.6 238.5L382.3 237.7L385.3 237.3L388.4 237.3L391.4 237.7L394 238.4L396.2 239.4L397.8 240.7L398.6 242.1L398.7 243.5M398.7 245.9L397.9 247.3L396.4 248.6L394.2 249.6L391.5 250.3L388.6 250.7L385.5 250.7L382.5 250.4L379.8 249.7L377.6 248.6L376 247.4L375.2 246L375.2 244.5M375.2 242.2L375.2 244.5M398.7 243.5L398.7 245.9"/></g>
<g class="iso-solid"><path class="iso-fill" d="M377.3 237.1L377.9 235.9L379.2 234.9L381 234L383.1 233.4L385.6 233.1L388.1 233.1L390.5 233.4L392.7 234L394.6 234.8L395.8 235.8L396.5 237L396.5 238.2L396.5 243.4L395.9 244.6L394.7 245.6L392.9 246.4L390.7 247L388.3 247.3L385.7 247.4L383.3 247.1L381.1 246.5L379.3 245.6L378 244.6L377.3 243.5L377.3 242.3Z"/><path class="iso-shade" data-shade="0" d="M392.9 246.4L390.7 247L390.7 241.8L392.9 241.2ZM396.5 243.4L395.9 244.6L395.9 239.3L396.5 238.2ZM395.9 244.6L394.7 245.6L394.7 240.4L395.9 239.3ZM394.7 245.6L392.9 246.4L392.9 241.2L394.7 240.4Z"/><path class="iso-shade" data-shade="1" d="M390.7 247L388.3 247.3L388.3 242.1L390.7 241.8ZM388.3 247.3L385.7 247.4L385.7 242.1L388.3 242.1Z"/><path class="iso-shade" data-shade="2" d="M385.7 247.4L383.3 247.1L383.3 241.8L385.7 242.1ZM383.3 247.1L381.1 246.5L381.1 241.3L383.3 241.8Z"/><path class="iso-shade" data-shade="3" d="M381.1 246.5L379.3 245.6L379.3 240.4L381.1 241.3ZM379.3 245.6L378 244.6L378 239.4L379.3 240.4ZM378 244.6L377.3 243.5L377.3 238.3L378 239.4ZM377.3 243.5L377.3 242.3L377.3 237.1L377.3 238.3Z"/><path class="iso-top" d="M392.9 241.2L390.7 241.8L388.3 242.1L385.7 242.1L383.3 241.8L381.1 241.3L379.3 240.4L378 239.4L377.3 238.3L377.3 237.1L377.9 235.9L379.2 234.9L381 234L383.1 233.4L385.6 233.1L388.1 233.1L390.5 233.4L392.7 234L394.6 234.8L395.8 235.8L396.5 237L396.5 238.2L395.9 239.3L394.7 240.4Z"/><path class="iso-line iso-crease" data-tone="faint" d="M396.5 238.2L395.9 239.3L394.7 240.4L392.9 241.2L390.7 241.8L388.3 242.1L385.7 242.1L383.3 241.8L381.1 241.3L379.3 240.4L378 239.4L377.3 238.3L377.3 237.1"/><path class="iso-line iso-edge" data-tone="mid" d="M377.3 237.1L377.9 235.9L379.2 234.9L381 234L383.1 233.4L385.6 233.1L388.1 233.1L390.5 233.4L392.7 234L394.6 234.8L395.8 235.8L396.5 237L396.5 238.2M396.5 243.4L395.9 244.6L394.7 245.6L392.9 246.4L390.7 247L388.3 247.3L385.7 247.4L383.3 247.1L381.1 246.5L379.3 245.6L378 244.6L377.3 243.5L377.3 242.3M377.3 237.1L377.3 242.3M396.5 238.2L396.5 243.4"/></g>
<g class="iso-solid"><path class="iso-fill" d="M195.4 308.1L196.2 306.7L197.7 305.4L199.9 304.4L202.6 303.7L205.5 303.3L208.6 303.3L211.6 303.6L214.3 304.3L216.5 305.4L218.1 306.6L218.9 308L218.9 309.5L218.9 311.8L218.2 313.2L216.6 314.5L214.5 315.5L211.8 316.3L208.8 316.7L205.7 316.7L202.7 316.3L200.1 315.6L197.9 314.6L196.3 313.3L195.5 311.9L195.4 310.5Z"/><path class="iso-shade" data-shade="0" d="M214.5 315.5L211.8 316.3L211.8 313.9L214.5 313.2ZM218.9 311.8L218.2 313.2L218.2 310.9L218.9 309.5ZM218.2 313.2L216.6 314.5L216.6 312.1L218.2 310.9ZM216.6 314.5L214.5 315.5L214.5 313.2L216.6 312.1Z"/><path class="iso-shade" data-shade="1" d="M211.8 316.3L208.8 316.7L208.8 314.3L211.8 313.9ZM208.8 316.7L205.7 316.7L205.7 314.3L208.8 314.3Z"/><path class="iso-shade" data-shade="2" d="M205.7 316.7L202.7 316.3L202.7 313.9L205.7 314.3ZM202.7 316.3L200.1 315.6L200.1 313.2L202.7 313.9Z"/><path class="iso-shade" data-shade="3" d="M200.1 315.6L197.9 314.6L197.9 312.2L200.1 313.2ZM197.9 314.6L196.3 313.3L196.3 310.9L197.9 312.2ZM196.3 313.3L195.5 311.9L195.5 309.5L196.3 310.9ZM195.5 311.9L195.4 310.5L195.4 308.1L195.5 309.5Z"/><path class="iso-top" d="M214.5 313.2L211.8 313.9L208.8 314.3L205.7 314.3L202.7 313.9L200.1 313.2L197.9 312.2L196.3 310.9L195.5 309.5L195.4 308.1L196.2 306.7L197.7 305.4L199.9 304.4L202.6 303.7L205.5 303.3L208.6 303.3L211.6 303.6L214.3 304.3L216.5 305.4L218.1 306.6L218.9 308L218.9 309.5L218.2 310.9L216.6 312.1Z"/><path class="iso-line iso-crease" data-tone="faint" d="M218.9 309.5L218.2 310.9L216.6 312.1L214.5 313.2L211.8 313.9L208.8 314.3L205.7 314.3L202.7 313.9L200.1 313.2L197.9 312.2L196.3 310.9L195.5 309.5L195.4 308.1"/><path class="iso-line iso-edge" data-tone="lo" d="M195.4 308.1L196.2 306.7L197.7 305.4L199.9 304.4L202.6 303.7L205.5 303.3L208.6 303.3L211.6 303.6L214.3 304.3L216.5 305.4L218.1 306.6L218.9 308L218.9 309.5M218.9 311.8L218.2 313.2L216.6 314.5L214.5 315.5L211.8 316.3L208.8 316.7L205.7 316.7L202.7 316.3L200.1 315.6L197.9 314.6L196.3 313.3L195.5 311.9L195.4 310.5M195.4 308.1L195.4 310.5M218.9 309.5L218.9 311.8"/></g>
<g class="iso-solid"><path class="iso-fill" d="M197.6 303L198.2 301.8L199.4 300.8L201.2 300L203.4 299.4L205.8 299L208.4 299L210.8 299.3L213 299.9L214.8 300.8L216.1 301.8L216.8 302.9L216.8 304.1L216.8 309.3L216.2 310.5L214.9 311.5L213.1 312.4L211 313L208.5 313.3L206 313.3L203.6 313L201.4 312.4L199.5 311.6L198.3 310.6L197.6 309.4L197.6 308.2Z"/><path class="iso-shade" data-shade="0" d="M213.1 312.4L211 313L211 307.7L213.1 307.1ZM216.8 309.3L216.2 310.5L216.2 305.3L216.8 304.1ZM216.2 310.5L214.9 311.5L214.9 306.3L216.2 305.3ZM214.9 311.5L213.1 312.4L213.1 307.1L214.9 306.3Z"/><path class="iso-shade" data-shade="1" d="M211 313L208.5 313.3L208.5 308.1L211 307.7ZM208.5 313.3L206 313.3L206 308.1L208.5 308.1Z"/><path class="iso-shade" data-shade="2" d="M206 313.3L203.6 313L203.6 307.8L206 308.1ZM203.6 313L201.4 312.4L201.4 307.2L203.6 307.8Z"/><path class="iso-shade" data-shade="3" d="M201.4 312.4L199.5 311.6L199.5 306.3L201.4 307.2ZM199.5 311.6L198.3 310.6L198.3 305.3L199.5 306.3ZM198.3 310.6L197.6 309.4L197.6 304.2L198.3 305.3ZM197.6 309.4L197.6 308.2L197.6 303L197.6 304.2Z"/><path class="iso-top" d="M213.1 307.1L211 307.7L208.5 308.1L206 308.1L203.6 307.8L201.4 307.2L199.5 306.3L198.3 305.3L197.6 304.2L197.6 303L198.2 301.8L199.4 300.8L201.2 300L203.4 299.4L205.8 299L208.4 299L210.8 299.3L213 299.9L214.8 300.8L216.1 301.8L216.8 302.9L216.8 304.1L216.2 305.3L214.9 306.3Z"/><path class="iso-line iso-crease" data-tone="faint" d="M216.8 304.1L216.2 305.3L214.9 306.3L213.1 307.1L211 307.7L208.5 308.1L206 308.1L203.6 307.8L201.4 307.2L199.5 306.3L198.3 305.3L197.6 304.2L197.6 303"/><path class="iso-line iso-edge" data-tone="mid" d="M197.6 303L198.2 301.8L199.4 300.8L201.2 300L203.4 299.4L205.8 299L208.4 299L210.8 299.3L213 299.9L214.8 300.8L216.1 301.8L216.8 302.9L216.8 304.1M216.8 309.3L216.2 310.5L214.9 311.5L213.1 312.4L211 313L208.5 313.3L206 313.3L203.6 313L201.4 312.4L199.5 311.6L198.3 310.6L197.6 309.4L197.6 308.2M197.6 303L197.6 308.2M216.8 304.1L216.8 309.3"/></g>
<g class="iso-solid"><path class="iso-fill" d="M541.5 338.8L542.3 337.4L543.8 336.2L546 335.1L548.6 334.4L551.6 334L554.7 334L557.7 334.4L560.4 335.1L562.6 336.1L564.2 337.3L565 338.7L565 340.2L565 342.6L564.2 344L562.7 345.2L560.5 346.3L557.9 347L554.9 347.4L551.8 347.4L548.8 347L546.1 346.3L543.9 345.3L542.4 344.1L541.5 342.7L541.5 341.2Z"/><path class="iso-shade" data-shade="0" d="M560.5 346.3L557.9 347L557.9 344.6L560.5 343.9ZM565 342.6L564.2 344L564.2 341.6L565 340.2ZM564.2 344L562.7 345.2L562.7 342.9L564.2 341.6ZM562.7 345.2L560.5 346.3L560.5 343.9L562.7 342.9Z"/><path class="iso-shade" data-shade="1" d="M557.9 347L554.9 347.4L554.9 345L557.9 344.6ZM554.9 347.4L551.8 347.4L551.8 345L554.9 345Z"/><path class="iso-shade" data-shade="2" d="M551.8 347.4L548.8 347L548.8 344.7L551.8 345ZM548.8 347L546.1 346.3L546.1 344L548.8 344.7Z"/><path class="iso-shade" data-shade="3" d="M546.1 346.3L543.9 345.3L543.9 342.9L546.1 344ZM543.9 345.3L542.4 344.1L542.4 341.7L543.9 342.9ZM542.4 344.1L541.5 342.7L541.5 340.3L542.4 341.7ZM541.5 342.7L541.5 341.2L541.5 338.8L541.5 340.3Z"/><path class="iso-top" d="M560.5 343.9L557.9 344.6L554.9 345L551.8 345L548.8 344.7L546.1 344L543.9 342.9L542.4 341.7L541.5 340.3L541.5 338.8L542.3 337.4L543.8 336.2L546 335.1L548.6 334.4L551.6 334L554.7 334L557.7 334.4L560.4 335.1L562.6 336.1L564.2 337.3L565 338.7L565 340.2L564.2 341.6L562.7 342.9Z"/><path class="iso-line iso-crease" data-tone="faint" d="M565 340.2L564.2 341.6L562.7 342.9L560.5 343.9L557.9 344.6L554.9 345L551.8 345L548.8 344.7L546.1 344L543.9 342.9L542.4 341.7L541.5 340.3L541.5 338.8"/><path class="iso-line iso-edge" data-tone="lo" d="M541.5 338.8L542.3 337.4L543.8 336.2L546 335.1L548.6 334.4L551.6 334L554.7 334L557.7 334.4L560.4 335.1L562.6 336.1L564.2 337.3L565 338.7L565 340.2M565 342.6L564.2 344L562.7 345.2L560.5 346.3L557.9 347L554.9 347.4L551.8 347.4L548.8 347L546.1 346.3L543.9 345.3L542.4 344.1L541.5 342.7L541.5 341.2M541.5 338.8L541.5 341.2M565 340.2L565 342.6"/></g>
<g class="iso-solid"><path class="iso-fill" d="M543.7 333.7L544.3 332.6L545.5 331.6L547.3 330.7L549.5 330.1L551.9 329.8L554.4 329.8L556.9 330.1L559.1 330.7L560.9 331.5L562.2 332.5L562.9 333.7L562.9 334.8L562.9 340.1L562.2 341.2L561 342.3L559.2 343.1L557 343.7L554.6 344L552.1 344L549.6 343.7L547.4 343.2L545.6 342.3L544.3 341.3L543.7 340.2L543.7 339Z"/><path class="iso-shade" data-shade="0" d="M559.2 343.1L557 343.7L557 338.5L559.2 337.9ZM562.9 340.1L562.2 341.2L562.2 336L562.9 334.8ZM562.2 341.2L561 342.3L561 337L562.2 336ZM561 342.3L559.2 343.1L559.2 337.9L561 337Z"/><path class="iso-shade" data-shade="1" d="M557 343.7L554.6 344L554.6 338.8L557 338.5ZM554.6 344L552.1 344L552.1 338.8L554.6 338.8Z"/><path class="iso-shade" data-shade="2" d="M552.1 344L549.6 343.7L549.6 338.5L552.1 338.8ZM549.6 343.7L547.4 343.2L547.4 337.9L549.6 338.5Z"/><path class="iso-shade" data-shade="3" d="M547.4 343.2L545.6 342.3L545.6 337.1L547.4 337.9ZM545.6 342.3L544.3 341.3L544.3 336.1L545.6 337.1ZM544.3 341.3L543.7 340.2L543.7 334.9L544.3 336.1ZM543.7 340.2L543.7 339L543.7 333.7L543.7 334.9Z"/><path class="iso-top" d="M559.2 337.9L557 338.5L554.6 338.8L552.1 338.8L549.6 338.5L547.4 337.9L545.6 337.1L544.3 336.1L543.7 334.9L543.7 333.7L544.3 332.6L545.5 331.6L547.3 330.7L549.5 330.1L551.9 329.8L554.4 329.8L556.9 330.1L559.1 330.7L560.9 331.5L562.2 332.5L562.9 333.7L562.9 334.8L562.2 336L561 337Z"/><path class="iso-line iso-crease" data-tone="faint" d="M562.9 334.8L562.2 336L561 337L559.2 337.9L557 338.5L554.6 338.8L552.1 338.8L549.6 338.5L547.4 337.9L545.6 337.1L544.3 336.1L543.7 334.9L543.7 333.7"/><path class="iso-line iso-edge" data-tone="mid" d="M543.7 333.7L544.3 332.6L545.5 331.6L547.3 330.7L549.5 330.1L551.9 329.8L554.4 329.8L556.9 330.1L559.1 330.7L560.9 331.5L562.2 332.5L562.9 333.7L562.9 334.8M562.9 340.1L562.2 341.2L561 342.3L559.2 343.1L557 343.7L554.6 344L552.1 344L549.6 343.7L547.4 343.2L545.6 342.3L544.3 341.3L543.7 340.2L543.7 339M543.7 333.7L543.7 339M562.9 334.8L562.9 340.1"/></g>
<g class="iso-solid"><path class="iso-fill" d="M355 407.3L355.8 405.9L357.3 404.6L359.5 403.6L362.1 402.8L365.1 402.4L368.2 402.4L371.2 402.8L373.9 403.5L376.1 404.5L377.6 405.8L378.5 407.2L378.5 408.6L378.5 411L377.7 412.4L376.2 413.7L374 414.7L371.4 415.4L368.4 415.8L365.3 415.8L362.3 415.5L359.6 414.7L357.4 413.7L355.8 412.5L355 411.1L355 409.6Z"/><path class="iso-shade" data-shade="0" d="M374 414.7L371.4 415.4L371.4 413.1L374 412.3ZM378.5 411L377.7 412.4L377.7 410L378.5 408.6ZM377.7 412.4L376.2 413.7L376.2 411.3L377.7 410ZM376.2 413.7L374 414.7L374 412.3L376.2 411.3Z"/><path class="iso-shade" data-shade="1" d="M371.4 415.4L368.4 415.8L368.4 413.4L371.4 413.1ZM368.4 415.8L365.3 415.8L365.3 413.5L368.4 413.4Z"/><path class="iso-shade" data-shade="2" d="M365.3 415.8L362.3 415.5L362.3 413.1L365.3 413.5ZM362.3 415.5L359.6 414.7L359.6 412.4L362.3 413.1Z"/><path class="iso-shade" data-shade="3" d="M359.6 414.7L357.4 413.7L357.4 411.4L359.6 412.4ZM357.4 413.7L355.8 412.5L355.8 410.1L357.4 411.4ZM355.8 412.5L355 411.1L355 408.7L355.8 410.1ZM355 411.1L355 409.6L355 407.3L355 408.7Z"/><path class="iso-top" d="M374 412.3L371.4 413.1L368.4 413.4L365.3 413.5L362.3 413.1L359.6 412.4L357.4 411.4L355.8 410.1L355 408.7L355 407.3L355.8 405.9L357.3 404.6L359.5 403.6L362.1 402.8L365.1 402.4L368.2 402.4L371.2 402.8L373.9 403.5L376.1 404.5L377.6 405.8L378.5 407.2L378.5 408.6L377.7 410L376.2 411.3Z"/><path class="iso-line iso-crease" data-tone="faint" d="M378.5 408.6L377.7 410L376.2 411.3L374 412.3L371.4 413.1L368.4 413.4L365.3 413.5L362.3 413.1L359.6 412.4L357.4 411.4L355.8 410.1L355 408.7L355 407.3"/><path class="iso-line iso-edge" data-tone="lo" d="M355 407.3L355.8 405.9L357.3 404.6L359.5 403.6L362.1 402.8L365.1 402.4L368.2 402.4L371.2 402.8L373.9 403.5L376.1 404.5L377.6 405.8L378.5 407.2L378.5 408.6M378.5 411L377.7 412.4L376.2 413.7L374 414.7L371.4 415.4L368.4 415.8L365.3 415.8L362.3 415.5L359.6 414.7L357.4 413.7L355.8 412.5L355 411.1L355 409.6M355 407.3L355 409.6M378.5 408.6L378.5 411"/></g>
<g class="iso-solid"><path class="iso-fill" d="M357.1 402.2L357.8 401L359 400L360.8 399.1L363 398.5L365.4 398.2L367.9 398.2L370.4 398.5L372.6 399.1L374.4 399.9L375.7 400.9L376.3 402.1L376.3 403.3L376.3 408.5L375.7 409.6L374.5 410.7L372.7 411.5L370.5 412.1L368.1 412.4L365.6 412.4L363.1 412.2L360.9 411.6L359.1 410.7L357.8 409.7L357.1 408.6L357.1 407.4Z"/><path class="iso-shade" data-shade="0" d="M372.7 411.5L370.5 412.1L370.5 406.9L372.7 406.3ZM376.3 408.5L375.7 409.6L375.7 404.4L376.3 403.3ZM375.7 409.6L374.5 410.7L374.5 405.4L375.7 404.4ZM374.5 410.7L372.7 411.5L372.7 406.3L374.5 405.4Z"/><path class="iso-shade" data-shade="1" d="M370.5 412.1L368.1 412.4L368.1 407.2L370.5 406.9ZM368.1 412.4L365.6 412.4L365.6 407.2L368.1 407.2Z"/><path class="iso-shade" data-shade="2" d="M365.6 412.4L363.1 412.2L363.1 406.9L365.6 407.2ZM363.1 412.2L360.9 411.6L360.9 406.3L363.1 406.9Z"/><path class="iso-shade" data-shade="3" d="M360.9 411.6L359.1 410.7L359.1 405.5L360.9 406.3ZM359.1 410.7L357.8 409.7L357.8 404.5L359.1 405.5ZM357.8 409.7L357.1 408.6L357.1 403.3L357.8 404.5ZM357.1 408.6L357.1 407.4L357.1 402.2L357.1 403.3Z"/><path class="iso-top" d="M372.7 406.3L370.5 406.9L368.1 407.2L365.6 407.2L363.1 406.9L360.9 406.3L359.1 405.5L357.8 404.5L357.1 403.3L357.1 402.2L357.8 401L359 400L360.8 399.1L363 398.5L365.4 398.2L367.9 398.2L370.4 398.5L372.6 399.1L374.4 399.9L375.7 400.9L376.3 402.1L376.3 403.3L375.7 404.4L374.5 405.4Z"/><path class="iso-line iso-crease" data-tone="faint" d="M376.3 403.3L375.7 404.4L374.5 405.4L372.7 406.3L370.5 406.9L368.1 407.2L365.6 407.2L363.1 406.9L360.9 406.3L359.1 405.5L357.8 404.5L357.1 403.3L357.1 402.2"/><path class="iso-line iso-edge" data-tone="mid" d="M357.1 402.2L357.8 401L359 400L360.8 399.1L363 398.5L365.4 398.2L367.9 398.2L370.4 398.5L372.6 399.1L374.4 399.9L375.7 400.9L376.3 402.1L376.3 403.3M376.3 408.5L375.7 409.6L374.5 410.7L372.7 411.5L370.5 412.1L368.1 412.4L365.6 412.4L363.1 412.2L360.9 411.6L359.1 410.7L357.8 409.7L357.1 408.6L357.1 407.4M357.1 402.2L357.1 407.4M376.3 403.3L376.3 408.5"/></g>
<g class="iso-solid"><path class="iso-fill" d="M701.1 438L701.8 436.6L703.4 435.3L705.5 434.3L708.2 433.6L711.2 433.2L714.3 433.2L717.3 433.5L719.9 434.2L722.1 435.3L723.7 436.5L724.5 437.9L724.6 439.4L724.6 441.7L723.8 443.1L722.3 444.4L720.1 445.4L717.4 446.2L714.5 446.6L711.4 446.6L708.4 446.2L705.7 445.5L703.5 444.5L701.9 443.2L701.1 441.8L701.1 440.4Z"/><path class="iso-shade" data-shade="0" d="M720.1 445.4L717.4 446.2L717.4 443.8L720.1 443.1ZM724.6 441.7L723.8 443.1L723.8 440.8L724.6 439.4ZM723.8 443.1L722.3 444.4L722.3 442L723.8 440.8ZM722.3 444.4L720.1 445.4L720.1 443.1L722.3 442Z"/><path class="iso-shade" data-shade="1" d="M717.4 446.2L714.5 446.6L714.5 444.2L717.4 443.8ZM714.5 446.6L711.4 446.6L711.4 444.2L714.5 444.2Z"/><path class="iso-shade" data-shade="2" d="M711.4 446.6L708.4 446.2L708.4 443.8L711.4 444.2ZM708.4 446.2L705.7 445.5L705.7 443.1L708.4 443.8Z"/><path class="iso-shade" data-shade="3" d="M705.7 445.5L703.5 444.5L703.5 442.1L705.7 443.1ZM703.5 444.5L701.9 443.2L701.9 440.9L703.5 442.1ZM701.9 443.2L701.1 441.8L701.1 439.5L701.9 440.9ZM701.1 441.8L701.1 440.4L701.1 438L701.1 439.5Z"/><path class="iso-top" d="M720.1 443.1L717.4 443.8L714.5 444.2L711.4 444.2L708.4 443.8L705.7 443.1L703.5 442.1L701.9 440.9L701.1 439.5L701.1 438L701.8 436.6L703.4 435.3L705.5 434.3L708.2 433.6L711.2 433.2L714.3 433.2L717.3 433.5L719.9 434.2L722.1 435.3L723.7 436.5L724.5 437.9L724.6 439.4L723.8 440.8L722.3 442Z"/><path class="iso-line iso-crease" data-tone="faint" d="M724.6 439.4L723.8 440.8L722.3 442L720.1 443.1L717.4 443.8L714.5 444.2L711.4 444.2L708.4 443.8L705.7 443.1L703.5 442.1L701.9 440.9L701.1 439.5L701.1 438"/><path class="iso-line iso-edge" data-tone="lo" d="M701.1 438L701.8 436.6L703.4 435.3L705.5 434.3L708.2 433.6L711.2 433.2L714.3 433.2L717.3 433.5L719.9 434.2L722.1 435.3L723.7 436.5L724.5 437.9L724.6 439.4M724.6 441.7L723.8 443.1L722.3 444.4L720.1 445.4L717.4 446.2L714.5 446.6L711.4 446.6L708.4 446.2L705.7 445.5L703.5 444.5L701.9 443.2L701.1 441.8L701.1 440.4M701.1 438L701.1 440.4M724.6 439.4L724.6 441.7"/></g>
<g class="iso-solid"><path class="iso-fill" d="M703.2 432.9L703.8 431.8L705.1 430.7L706.9 429.9L709 429.3L711.5 429L714 428.9L716.4 429.2L718.6 429.8L720.5 430.7L721.7 431.7L722.4 432.8L722.4 434L722.4 439.2L721.8 440.4L720.6 441.4L718.8 442.3L716.6 442.9L714.2 443.2L711.6 443.2L709.2 442.9L707 442.3L705.2 441.5L703.9 440.5L703.2 439.3L703.2 438.1Z"/><path class="iso-shade" data-shade="0" d="M718.8 442.3L716.6 442.9L716.6 437.6L718.8 437ZM722.4 439.2L721.8 440.4L721.8 435.2L722.4 434ZM721.8 440.4L720.6 441.4L720.6 436.2L721.8 435.2ZM720.6 441.4L718.8 442.3L718.8 437L720.6 436.2Z"/><path class="iso-shade" data-shade="1" d="M716.6 442.9L714.2 443.2L714.2 438L716.6 437.6ZM714.2 443.2L711.6 443.2L711.6 438L714.2 438Z"/><path class="iso-shade" data-shade="2" d="M711.6 443.2L709.2 442.9L709.2 437.7L711.6 438ZM709.2 442.9L707 442.3L707 437.1L709.2 437.7Z"/><path class="iso-shade" data-shade="3" d="M707 442.3L705.2 441.5L705.2 436.3L707 437.1ZM705.2 441.5L703.9 440.5L703.9 435.2L705.2 436.3ZM703.9 440.5L703.2 439.3L703.2 434.1L703.9 435.2ZM703.2 439.3L703.2 438.1L703.2 432.9L703.2 434.1Z"/><path class="iso-top" d="M718.8 437L716.6 437.6L714.2 438L711.6 438L709.2 437.7L707 437.1L705.2 436.3L703.9 435.2L703.2 434.1L703.2 432.9L703.8 431.8L705.1 430.7L706.9 429.9L709 429.3L711.5 429L714 428.9L716.4 429.2L718.6 429.8L720.5 430.7L721.7 431.7L722.4 432.8L722.4 434L721.8 435.2L720.6 436.2Z"/><path class="iso-line iso-crease" data-tone="faint" d="M722.4 434L721.8 435.2L720.6 436.2L718.8 437L716.6 437.6L714.2 438L711.6 438L709.2 437.7L707 437.1L705.2 436.3L703.9 435.2L703.2 434.1L703.2 432.9"/><path class="iso-line iso-edge" data-tone="mid" d="M703.2 432.9L703.8 431.8L705.1 430.7L706.9 429.9L709 429.3L711.5 429L714 428.9L716.4 429.2L718.6 429.8L720.5 430.7L721.7 431.7L722.4 432.8L722.4 434M722.4 439.2L721.8 440.4L720.6 441.4L718.8 442.3L716.6 442.9L714.2 443.2L711.6 443.2L709.2 442.9L707 442.3L705.2 441.5L703.9 440.5L703.2 439.3L703.2 438.1M703.2 432.9L703.2 438.1M722.4 434L722.4 439.2"/></g>
<g class="iso-solid"><path class="iso-fill" d="M521.3 503.9L522.1 502.5L523.6 501.3L525.8 500.2L528.5 499.5L531.4 499.1L534.5 499.1L537.5 499.5L540.2 500.2L542.4 501.2L544 502.4L544.8 503.8L544.8 505.3L544.8 507.7L544.1 509.1L542.5 510.3L540.4 511.4L537.7 512.1L534.7 512.5L531.6 512.5L528.6 512.1L526 511.4L523.8 510.4L522.2 509.2L521.4 507.8L521.3 506.3Z"/><path class="iso-shade" data-shade="0" d="M540.4 511.4L537.7 512.1L537.7 509.7L540.4 509ZM544.8 507.7L544.1 509.1L544.1 506.7L544.8 505.3ZM544.1 509.1L542.5 510.3L542.5 508L544.1 506.7ZM542.5 510.3L540.4 511.4L540.4 509L542.5 508Z"/><path class="iso-shade" data-shade="1" d="M537.7 512.1L534.7 512.5L534.7 510.1L537.7 509.7ZM534.7 512.5L531.6 512.5L531.6 510.1L534.7 510.1Z"/><path class="iso-shade" data-shade="2" d="M531.6 512.5L528.6 512.1L528.6 509.8L531.6 510.1ZM528.6 512.1L526 511.4L526 509L528.6 509.8Z"/><path class="iso-shade" data-shade="3" d="M526 511.4L523.8 510.4L523.8 508L526 509ZM523.8 510.4L522.2 509.2L522.2 506.8L523.8 508ZM522.2 509.2L521.4 507.8L521.4 505.4L522.2 506.8ZM521.4 507.8L521.3 506.3L521.3 503.9L521.4 505.4Z"/><path class="iso-top" d="M540.4 509L537.7 509.7L534.7 510.1L531.6 510.1L528.6 509.8L526 509L523.8 508L522.2 506.8L521.4 505.4L521.3 503.9L522.1 502.5L523.6 501.3L525.8 500.2L528.5 499.5L531.4 499.1L534.5 499.1L537.5 499.5L540.2 500.2L542.4 501.2L544 502.4L544.8 503.8L544.8 505.3L544.1 506.7L542.5 508Z"/><path class="iso-line iso-crease" data-tone="faint" d="M544.8 505.3L544.1 506.7L542.5 508L540.4 509L537.7 509.7L534.7 510.1L531.6 510.1L528.6 509.8L526 509L523.8 508L522.2 506.8L521.4 505.4L521.3 503.9"/><path class="iso-line iso-edge" data-tone="lo" d="M521.3 503.9L522.1 502.5L523.6 501.3L525.8 500.2L528.5 499.5L531.4 499.1L534.5 499.1L537.5 499.5L540.2 500.2L542.4 501.2L544 502.4L544.8 503.8L544.8 505.3M544.8 507.7L544.1 509.1L542.5 510.3L540.4 511.4L537.7 512.1L534.7 512.5L531.6 512.5L528.6 512.1L526 511.4L523.8 510.4L522.2 509.2L521.4 507.8L521.3 506.3M521.3 503.9L521.3 506.3M544.8 505.3L544.8 507.7"/></g>
<g class="iso-solid"><path class="iso-fill" d="M523.5 498.8L524.1 497.7L525.3 496.6L527.1 495.8L529.3 495.2L531.7 494.9L534.3 494.9L536.7 495.2L538.9 495.8L540.7 496.6L542 497.6L542.7 498.8L542.7 499.9L542.7 505.2L542.1 506.3L540.8 507.3L539 508.2L536.9 508.8L534.4 509.1L531.9 509.1L529.5 508.8L527.3 508.2L525.4 507.4L524.2 506.4L523.5 505.2L523.5 504.1Z"/><path class="iso-shade" data-shade="0" d="M539 508.2L536.9 508.8L536.9 503.6L539 503ZM542.7 505.2L542.1 506.3L542.1 501.1L542.7 499.9ZM542.1 506.3L540.8 507.3L540.8 502.1L542.1 501.1ZM540.8 507.3L539 508.2L539 503L540.8 502.1Z"/><path class="iso-shade" data-shade="1" d="M536.9 508.8L534.4 509.1L534.4 503.9L536.9 503.6ZM534.4 509.1L531.9 509.1L531.9 503.9L534.4 503.9Z"/><path class="iso-shade" data-shade="2" d="M531.9 509.1L529.5 508.8L529.5 503.6L531.9 503.9ZM529.5 508.8L527.3 508.2L527.3 503L529.5 503.6Z"/><path class="iso-shade" data-shade="3" d="M527.3 508.2L525.4 507.4L525.4 502.2L527.3 503ZM525.4 507.4L524.2 506.4L524.2 501.2L525.4 502.2ZM524.2 506.4L523.5 505.2L523.5 500L524.2 501.2ZM523.5 505.2L523.5 504.1L523.5 498.8L523.5 500Z"/><path class="iso-top" d="M539 503L536.9 503.6L534.4 503.9L531.9 503.9L529.5 503.6L527.3 503L525.4 502.2L524.2 501.2L523.5 500L523.5 498.8L524.1 497.7L525.3 496.6L527.1 495.8L529.3 495.2L531.7 494.9L534.3 494.9L536.7 495.2L538.9 495.8L540.7 496.6L542 497.6L542.7 498.8L542.7 499.9L542.1 501.1L540.8 502.1Z"/><path class="iso-line iso-crease" data-tone="faint" d="M542.7 499.9L542.1 501.1L540.8 502.1L539 503L536.9 503.6L534.4 503.9L531.9 503.9L529.5 503.6L527.3 503L525.4 502.2L524.2 501.2L523.5 500L523.5 498.8"/><path class="iso-line iso-edge" data-tone="mid" d="M523.5 498.8L524.1 497.7L525.3 496.6L527.1 495.8L529.3 495.2L531.7 494.9L534.3 494.9L536.7 495.2L538.9 495.8L540.7 496.6L542 497.6L542.7 498.8L542.7 499.9M542.7 505.2L542.1 506.3L540.8 507.3L539 508.2L536.9 508.8L534.4 509.1L531.9 509.1L529.5 508.8L527.3 508.2L525.4 507.4L524.2 506.4L523.5 505.2L523.5 504.1M523.5 498.8L523.5 504.1M542.7 499.9L542.7 505.2"/></g>
<g class="iso-solid"><path class="iso-fill" d="M177.1 289.9L177.1 288.5L177.8 287.2L179 285.9L180.7 284.8L182.8 283.8L379.5 211.7L382 210.9L384.7 210.4L387.7 210.2L390.6 210.2L393.5 210.5L396.2 211.1L398.6 211.9L400.6 212.9L739.8 416.7L741.4 417.8L742.4 419.1L742.9 420.5L742.9 433.8L742.9 435.2L742.2 436.5L741 437.8L739.3 438.9L737.2 439.9L540.5 512L538 512.8L535.3 513.3L532.3 513.5L529.4 513.5L526.5 513.2L523.8 512.6L521.4 511.8L519.4 510.8L180.2 307L178.6 305.9L177.6 304.6L177.1 303.2Z"/><path class="iso-shade" data-shade="0" d="M742.9 433.8L742.9 435.2L742.9 421.9L742.9 420.5ZM742.9 435.2L742.2 436.5L742.2 423.2L742.9 421.9ZM742.2 436.5L741 437.8L741 424.5L742.2 423.2ZM741 437.8L739.3 438.9L739.3 425.6L741 424.5ZM739.3 438.9L737.2 439.9L737.2 426.6L739.3 425.6ZM737.2 439.9L540.5 512L540.5 498.7L737.2 426.6ZM540.5 512L538 512.8L538 499.5L540.5 498.7Z"/><path class="iso-shade" data-shade="1" d="M538 512.8L535.3 513.3L535.3 500L538 499.5ZM535.3 513.3L532.3 513.5L532.3 500.2L535.3 500Z"/><path class="iso-shade" data-shade="2" d="M532.3 513.5L529.4 513.5L529.4 500.2L532.3 500.2ZM529.4 513.5L526.5 513.2L526.5 499.9L529.4 500.2ZM526.5 513.2L523.8 512.6L523.8 499.3L526.5 499.9Z"/><path class="iso-shade" data-shade="3" d="M523.8 512.6L521.4 511.8L521.4 498.5L523.8 499.3ZM521.4 511.8L519.4 510.8L519.4 497.5L521.4 498.5ZM519.4 510.8L180.2 307L180.2 293.7L519.4 497.5ZM180.2 307L178.6 305.9L178.6 292.6L180.2 293.7ZM178.6 305.9L177.6 304.6L177.6 291.3L178.6 292.6ZM177.6 304.6L177.1 303.2L177.1 289.9L177.6 291.3Z"/><path class="iso-top" d="M739.8 416.7L741.4 417.8L742.4 419.1L742.9 420.5L742.9 421.9L742.2 423.2L741 424.5L739.3 425.6L737.2 426.6L540.5 498.7L538 499.5L535.3 500L532.3 500.2L529.4 500.2L526.5 499.9L523.8 499.3L521.4 498.5L519.4 497.5L180.2 293.7L178.6 292.6L177.6 291.3L177.1 289.9L177.1 288.5L177.8 287.2L179 285.9L180.7 284.8L182.8 283.8L379.5 211.7L382 210.9L384.7 210.4L387.7 210.2L390.6 210.2L393.5 210.5L396.2 211.1L398.6 211.9L400.6 212.9Z"/><path class="iso-line iso-crease" data-tone="faint" d="M742.9 420.5L742.9 421.9L742.2 423.2L741 424.5L739.3 425.6L737.2 426.6L540.5 498.7L538 499.5L535.3 500L532.3 500.2L529.4 500.2L526.5 499.9L523.8 499.3L521.4 498.5L519.4 497.5L180.2 293.7L178.6 292.6L177.6 291.3L177.1 289.9"/><path class="iso-line iso-edge" data-tone="mid" d="M177.1 289.9L177.1 288.5L177.8 287.2L179 285.9L180.7 284.8L182.8 283.8L379.5 211.7L382 210.9L384.7 210.4L387.7 210.2L390.6 210.2L393.5 210.5L396.2 211.1L398.6 211.9L400.6 212.9L739.8 416.7L741.4 417.8L742.4 419.1L742.9 420.5M742.9 433.8L742.9 435.2L742.2 436.5L741 437.8L739.3 438.9L737.2 439.9L540.5 512L538 512.8L535.3 513.3L532.3 513.5L529.4 513.5L526.5 513.2L523.8 512.6L521.4 511.8L519.4 510.8L180.2 307L178.6 305.9L177.6 304.6L177.1 303.2M742.9 420.5L742.9 433.8M177.1 289.9L177.1 303.2"/></g>
<path class="iso-line" data-tone="lo" d="M733 419.2L733.7 419.7L734.1 420.2L734.4 420.8L734.3 421.4L734.1 422L733.5 422.5L732.8 423L731.9 423.4L535.2 495.6L534.1 495.9L533 496.1L531.7 496.2L530.4 496.2L529.2 496.1L528 495.8L527 495.5L526.1 495L187 291.2L186.3 290.7L185.9 290.2L185.6 289.6L185.7 289L185.9 288.4L186.5 287.9L187.2 287.4L188.1 287L384.8 214.8L385.9 214.5L387 214.3L388.3 214.2L389.6 214.2L390.8 214.4L392 214.6L393 214.9L393.9 215.4Z"/>
<path class="iso-line" data-tone="lo" d="M201 296.4L198.9 297.1M211.6 302.7L209.5 303.5M222.2 309.1L220.1 309.9M243.4 321.8L241.3 322.6M254 328.2L251.9 329M264.6 334.6L262.4 335.4M285.8 347.3L283.6 348.1M296.4 353.7L294.2 354.5M307 360.1L304.8 360.8M328.2 372.8L326 373.6M338.8 379.2L336.6 379.9M349.4 385.5L347.2 386.3M370.6 398.3L368.4 399M381.2 404.6L379 405.4M391.8 411L389.6 411.8M412.9 423.7L410.8 424.5M423.5 430.1L421.4 430.9M434.1 436.5L432 437.3M455.3 449.2L453.2 450M465.9 455.6L463.8 456.4M476.5 462L474.4 462.7M497.7 474.7L495.6 475.5M508.3 481.1L506.2 481.8M518.9 487.4L516.8 488.2"/>
<path class="iso-line" data-tone="lo" d="M232.8 315.5L229 316.9M275.2 341L271.4 342.3M317.6 366.4L313.7 367.8M360 391.9L356.1 393.3M402.3 417.4L398.5 418.8M444.7 442.8L440.9 444.2M487.1 468.3L483.3 469.7"/>
<g class="iso-solid"><path class="iso-fill" d="M193.9 289.5L193.9 289.3L194 289.1L194.2 288.9L194.4 288.7L194.7 288.6L211.7 282.4L212 282.3L212.4 282.2L212.8 282.2L213.3 282.2L213.7 282.2L214.1 282.3L214.4 282.4L214.7 282.6L262.4 311.2L262.6 311.4L262.8 311.6L262.8 311.8L262.8 314.1L262.8 314.3L262.7 314.5L262.6 314.7L262.3 314.9L262 315L245.1 321.2L244.7 321.3L244.3 321.4L243.9 321.4L243.5 321.4L243.1 321.4L242.7 321.3L242.3 321.2L242 321L194.4 292.4L194.1 292.2L194 292L193.9 291.8Z"/><path class="iso-shade" data-shade="0" d="M262.8 314.1L262.8 314.3L262.8 312L262.8 311.8ZM262.8 314.3L262.7 314.5L262.7 312.1L262.8 312ZM262.7 314.5L262.6 314.7L262.6 312.3L262.7 312.1ZM262.6 314.7L262.3 314.9L262.3 312.5L262.6 312.3ZM262.3 314.9L262 315L262 312.6L262.3 312.5ZM262 315L245.1 321.2L245.1 318.8L262 312.6ZM245.1 321.2L244.7 321.3L244.7 319L245.1 318.8Z"/><path class="iso-shade" data-shade="1" d="M244.7 321.3L244.3 321.4L244.3 319L244.7 319ZM244.3 321.4L243.9 321.4L243.9 319.1L244.3 319Z"/><path class="iso-shade" data-shade="2" d="M243.9 321.4L243.5 321.4L243.5 319.1L243.9 319.1ZM243.5 321.4L243.1 321.4L243.1 319L243.5 319.1ZM243.1 321.4L242.7 321.3L242.7 318.9L243.1 319Z"/><path class="iso-shade" data-shade="3" d="M242.7 321.3L242.3 321.2L242.3 318.8L242.7 318.9ZM242.3 321.2L242 321L242 318.7L242.3 318.8ZM242 321L194.4 292.4L194.4 290L242 318.7ZM194.4 292.4L194.1 292.2L194.1 289.8L194.4 290ZM194.1 292.2L194 292L194 289.7L194.1 289.8ZM194 292L193.9 291.8L193.9 289.5L194 289.7Z"/><path class="iso-top" d="M262.4 311.2L262.6 311.4L262.8 311.6L262.8 311.8L262.8 312L262.7 312.1L262.6 312.3L262.3 312.5L262 312.6L245.1 318.8L244.7 319L244.3 319L243.9 319.1L243.5 319.1L243.1 319L242.7 318.9L242.3 318.8L242 318.7L194.4 290L194.1 289.8L194 289.7L193.9 289.5L193.9 289.3L194 289.1L194.2 288.9L194.4 288.7L194.7 288.6L211.7 282.4L212 282.3L212.4 282.2L212.8 282.2L213.3 282.2L213.7 282.2L214.1 282.3L214.4 282.4L214.7 282.6Z"/><path class="iso-line iso-crease" data-tone="faint" d="M262.8 311.8L262.8 312L262.7 312.1L262.6 312.3L262.3 312.5L262 312.6L245.1 318.8L244.7 319L244.3 319L243.9 319.1L243.5 319.1L243.1 319L242.7 318.9L242.3 318.8L242 318.7L194.4 290L194.1 289.8L194 289.7L193.9 289.5"/><path class="iso-line iso-edge" data-tone="hi" d="M193.9 289.5L193.9 289.3L194 289.1L194.2 288.9L194.4 288.7L194.7 288.6L211.7 282.4L212 282.3L212.4 282.2L212.8 282.2L213.3 282.2L213.7 282.2L214.1 282.3L214.4 282.4L214.7 282.6L262.4 311.2L262.6 311.4L262.8 311.6L262.8 311.8M262.8 314.1L262.8 314.3L262.7 314.5L262.6 314.7L262.3 314.9L262 315L245.1 321.2L244.7 321.3L244.3 321.4L243.9 321.4L243.5 321.4L243.1 321.4L242.7 321.3L242.3 321.2L242 321L194.4 292.4L194.1 292.2L194 292L193.9 291.8M262.8 311.8L262.8 314.1M193.9 289.5L193.9 291.8"/></g>
<g class="iso-dots" data-tone="mid"><circle cx="212.6" cy="284.6" r="0.5"/><circle cx="257.7" cy="311.7" r="0.5"/><circle cx="199.1" cy="289.6" r="0.5"/><circle cx="244.1" cy="316.6" r="0.5"/></g>
<g class="iso-solid"><path class="iso-fill" d="M227 288L227.1 287.6L227.3 287.2L227.6 286.8L228.1 286.5L228.7 286.3L355.9 239.6L356.6 239.4L357.4 239.2L358.2 239.2L359 239.2L359.9 239.3L360.6 239.4L361.3 239.7L361.9 240L481.1 311.6L481.6 311.9L481.9 312.3L482 312.7L482 316.5L482 316.9L481.8 317.3L481.5 317.6L481 318L480.4 318.2L353.2 364.9L352.5 365.1L351.7 365.2L350.9 365.3L350 365.3L349.2 365.2L348.5 365L347.8 364.8L347.2 364.5L228 292.9L227.5 292.6L227.2 292.2L227 291.8Z"/><path class="iso-shade" data-shade="0" d="M482 316.5L482 316.9L482 313.1L482 312.7ZM482 316.9L481.8 317.3L481.8 313.5L482 313.1ZM481.8 317.3L481.5 317.6L481.5 313.8L481.8 313.5ZM481.5 317.6L481 318L481 314.2L481.5 313.8ZM481 318L480.4 318.2L480.4 314.4L481 314.2ZM480.4 318.2L353.2 364.9L353.2 361.1L480.4 314.4ZM353.2 364.9L352.5 365.1L352.5 361.3L353.2 361.1Z"/><path class="iso-shade" data-shade="1" d="M352.5 365.1L351.7 365.2L351.7 361.4L352.5 361.3ZM351.7 365.2L350.9 365.3L350.9 361.5L351.7 361.4Z"/><path class="iso-shade" data-shade="2" d="M350.9 365.3L350 365.3L350 361.5L350.9 361.5ZM350 365.3L349.2 365.2L349.2 361.4L350 361.5ZM349.2 365.2L348.5 365L348.5 361.2L349.2 361.4Z"/><path class="iso-shade" data-shade="3" d="M348.5 365L347.8 364.8L347.8 361L348.5 361.2ZM347.8 364.8L347.2 364.5L347.2 360.7L347.8 361ZM347.2 364.5L228 292.9L228 289.1L347.2 360.7ZM228 292.9L227.5 292.6L227.5 288.8L228 289.1ZM227.5 292.6L227.2 292.2L227.2 288.4L227.5 288.8ZM227.2 292.2L227 291.8L227 288L227.2 288.4Z"/><path class="iso-top" d="M481.1 311.6L481.6 311.9L481.9 312.3L482 312.7L482 313.1L481.8 313.5L481.5 313.8L481 314.2L480.4 314.4L353.2 361.1L352.5 361.3L351.7 361.4L350.9 361.5L350 361.5L349.2 361.4L348.5 361.2L347.8 361L347.2 360.7L228 289.1L227.5 288.8L227.2 288.4L227 288L227.1 287.6L227.3 287.2L227.6 286.8L228.1 286.5L228.7 286.3L355.9 239.6L356.6 239.4L357.4 239.2L358.2 239.2L359 239.2L359.9 239.3L360.6 239.4L361.3 239.7L361.9 240Z"/><path class="iso-line iso-crease" data-tone="faint" d="M482 312.7L482 313.1L481.8 313.5L481.5 313.8L481 314.2L480.4 314.4L353.2 361.1L352.5 361.3L351.7 361.4L350.9 361.5L350 361.5L349.2 361.4L348.5 361.2L347.8 361L347.2 360.7L228 289.1L227.5 288.8L227.2 288.4L227 288"/><path class="iso-line iso-edge" data-tone="lo" d="M227 288L227.1 287.6L227.3 287.2L227.6 286.8L228.1 286.5L228.7 286.3L355.9 239.6L356.6 239.4L357.4 239.2L358.2 239.2L359 239.2L359.9 239.3L360.6 239.4L361.3 239.7L361.9 240L481.1 311.6L481.6 311.9L481.9 312.3L482 312.7M482 316.5L482 316.9L481.8 317.3L481.5 317.6L481 318L480.4 318.2L353.2 364.9L352.5 365.1L351.7 365.2L350.9 365.3L350 365.3L349.2 365.2L348.5 365L347.8 364.8L347.2 364.5L228 292.9L227.5 292.6L227.2 292.2L227 291.8M482 312.7L482 316.5M227 288L227 291.8"/></g>
<g class="iso-solid"><path class="iso-fill" d="M347.1 59.5L347.1 59.4L347.1 59.3L347.2 59.2L347.3 59.1L347.5 59L357.7 55.3L357.8 55.3L358 55.2L358.3 55.2L358.5 55.2L358.7 55.2L358.9 55.3L359 55.3L359.2 55.4L367.1 60.2L367.2 60.3L367.3 60.4L367.4 60.4L367.4 246.6L367.3 246.7L367.3 246.8L367.2 246.9L367.1 247L366.9 247.1L356.8 250.8L356.6 250.9L356.4 250.9L356.2 250.9L356 250.9L355.8 250.9L355.6 250.9L355.4 250.8L355.3 250.7L347.3 245.9L347.2 245.9L347.1 245.8L347.1 245.7Z"/><path class="iso-shade" data-shade="0" d="M367.4 246.6L367.3 246.7L367.3 60.5L367.4 60.4ZM367.3 246.7L367.3 246.8L367.3 60.6L367.3 60.5ZM367.3 246.8L367.2 246.9L367.2 60.7L367.3 60.6ZM367.2 246.9L367.1 247L367.1 60.8L367.2 60.7ZM367.1 247L366.9 247.1L366.9 60.9L367.1 60.8ZM366.9 247.1L356.8 250.8L356.8 64.6L366.9 60.9ZM356.8 250.8L356.6 250.9L356.6 64.7L356.8 64.6Z"/><path class="iso-shade" data-shade="1" d="M356.6 250.9L356.4 250.9L356.4 64.7L356.6 64.7ZM356.4 250.9L356.2 250.9L356.2 64.7L356.4 64.7Z"/><path class="iso-shade" data-shade="2" d="M356.2 250.9L356 250.9L356 64.7L356.2 64.7ZM356 250.9L355.8 250.9L355.8 64.7L356 64.7ZM355.8 250.9L355.6 250.9L355.6 64.7L355.8 64.7Z"/><path class="iso-shade" data-shade="3" d="M355.6 250.9L355.4 250.8L355.4 64.6L355.6 64.7ZM355.4 250.8L355.3 250.7L355.3 64.5L355.4 64.6ZM355.3 250.7L347.3 245.9L347.3 59.8L355.3 64.5ZM347.3 245.9L347.2 245.9L347.2 59.7L347.3 59.8ZM347.2 245.9L347.1 245.8L347.1 59.6L347.2 59.7ZM347.1 245.8L347.1 245.7L347.1 59.5L347.1 59.6Z"/><path class="iso-top" d="M367.1 60.2L367.2 60.3L367.3 60.4L367.4 60.4L367.3 60.5L367.3 60.6L367.2 60.7L367.1 60.8L366.9 60.9L356.8 64.6L356.6 64.7L356.4 64.7L356.2 64.7L356 64.7L355.8 64.7L355.6 64.7L355.4 64.6L355.3 64.5L347.3 59.8L347.2 59.7L347.1 59.6L347.1 59.5L347.1 59.4L347.1 59.3L347.2 59.2L347.3 59.1L347.5 59L357.7 55.3L357.8 55.3L358 55.2L358.3 55.2L358.5 55.2L358.7 55.2L358.9 55.3L359 55.3L359.2 55.4Z"/><path class="iso-line iso-crease" data-tone="faint" d="M367.4 60.4L367.3 60.5L367.3 60.6L367.2 60.7L367.1 60.8L366.9 60.9L356.8 64.6L356.6 64.7L356.4 64.7L356.2 64.7L356 64.7L355.8 64.7L355.6 64.7L355.4 64.6L355.3 64.5L347.3 59.8L347.2 59.7L347.1 59.6L347.1 59.5"/><path class="iso-line iso-edge" data-tone="mid" d="M347.1 59.5L347.1 59.4L347.1 59.3L347.2 59.2L347.3 59.1L347.5 59L357.7 55.3L357.8 55.3L358 55.2L358.3 55.2L358.5 55.2L358.7 55.2L358.9 55.3L359 55.3L359.2 55.4L367.1 60.2L367.2 60.3L367.3 60.4L367.4 60.4M367.4 246.6L367.3 246.7L367.3 246.8L367.2 246.9L367.1 247L366.9 247.1L356.8 250.8L356.6 250.9L356.4 250.9L356.2 250.9L356 250.9L355.8 250.9L355.6 250.9L355.4 250.8L355.3 250.7L347.3 245.9L347.2 245.9L347.1 245.8L347.1 245.7M367.4 60.4L367.4 246.6M347.1 59.5L347.1 245.7"/></g>
<path class="iso-line" data-tone="lo" d="M 351.2845016833392 248.33627868354557 L 351.2845016833392 62.1396268256089"/>
<g class="iso-solid"><path class="iso-fill" d="M457 125.6L457 125.5L457.1 125.4L457.2 125.3L457.3 125.2L457.5 125.1L467.6 121.4L467.8 121.3L468 121.3L468.2 121.3L468.4 121.3L468.6 121.3L468.8 121.3L469 121.4L469.1 121.5L477.1 126.2L477.2 126.3L477.3 126.4L477.3 126.5L477.3 312.7L477.3 312.8L477.3 312.9L477.2 313L477.1 313.1L476.9 313.2L466.7 316.9L466.6 316.9L466.4 317L466.1 317L465.9 317L465.7 317L465.5 316.9L465.4 316.9L465.2 316.8L457.3 312L457.2 311.9L457.1 311.8L457 311.7Z"/><path class="iso-shade" data-shade="0" d="M477.3 312.7L477.3 312.8L477.3 126.6L477.3 126.5ZM477.3 312.8L477.3 312.9L477.3 126.7L477.3 126.6ZM477.3 312.9L477.2 313L477.2 126.8L477.3 126.7ZM477.2 313L477.1 313.1L477.1 126.9L477.2 126.8ZM477.1 313.1L476.9 313.2L476.9 127L477.1 126.9ZM476.9 313.2L466.7 316.9L466.7 130.7L476.9 127ZM466.7 316.9L466.6 316.9L466.6 130.7L466.7 130.7Z"/><path class="iso-shade" data-shade="1" d="M466.6 316.9L466.4 317L466.4 130.8L466.6 130.7ZM466.4 317L466.1 317L466.1 130.8L466.4 130.8Z"/><path class="iso-shade" data-shade="2" d="M466.1 317L465.9 317L465.9 130.8L466.1 130.8ZM465.9 317L465.7 317L465.7 130.8L465.9 130.8ZM465.7 317L465.5 316.9L465.5 130.7L465.7 130.8Z"/><path class="iso-shade" data-shade="3" d="M465.5 316.9L465.4 316.9L465.4 130.7L465.5 130.7ZM465.4 316.9L465.2 316.8L465.2 130.6L465.4 130.7ZM465.2 316.8L457.3 312L457.3 125.8L465.2 130.6ZM457.3 312L457.2 311.9L457.2 125.7L457.3 125.8ZM457.2 311.9L457.1 311.8L457.1 125.6L457.2 125.7ZM457.1 311.8L457 311.7L457 125.6L457.1 125.6Z"/><path class="iso-top" d="M477.1 126.2L477.2 126.3L477.3 126.4L477.3 126.5L477.3 126.6L477.3 126.7L477.2 126.8L477.1 126.9L476.9 127L466.7 130.7L466.6 130.7L466.4 130.8L466.1 130.8L465.9 130.8L465.7 130.8L465.5 130.7L465.4 130.7L465.2 130.6L457.3 125.8L457.2 125.7L457.1 125.6L457 125.6L457 125.5L457.1 125.4L457.2 125.3L457.3 125.2L457.5 125.1L467.6 121.4L467.8 121.3L468 121.3L468.2 121.3L468.4 121.3L468.6 121.3L468.8 121.3L469 121.4L469.1 121.5Z"/><path class="iso-line iso-crease" data-tone="faint" d="M477.3 126.5L477.3 126.6L477.3 126.7L477.2 126.8L477.1 126.9L476.9 127L466.7 130.7L466.6 130.7L466.4 130.8L466.1 130.8L465.9 130.8L465.7 130.8L465.5 130.7L465.4 130.7L465.2 130.6L457.3 125.8L457.2 125.7L457.1 125.6L457 125.6"/><path class="iso-line iso-edge" data-tone="mid" d="M457 125.6L457 125.5L457.1 125.4L457.2 125.3L457.3 125.2L457.5 125.1L467.6 121.4L467.8 121.3L468 121.3L468.2 121.3L468.4 121.3L468.6 121.3L468.8 121.3L469 121.4L469.1 121.5L477.1 126.2L477.2 126.3L477.3 126.4L477.3 126.5M477.3 312.7L477.3 312.8L477.3 312.9L477.2 313L477.1 313.1L476.9 313.2L466.7 316.9L466.6 316.9L466.4 317L466.1 317L465.9 317L465.7 317L465.5 316.9L465.4 316.9L465.2 316.8L457.3 312L457.2 311.9L457.1 311.8L457 311.7M477.3 126.5L477.3 312.7M457 125.6L457 311.7"/></g>
<path class="iso-line" data-tone="lo" d="M 461.24354073671174 314.4102472238816 L 461.24354073671174 128.21359536594494"/>
<g class="iso-solid"><path class="iso-fill" d="M231.8 101.8L231.8 101.7L231.8 101.6L231.9 101.5L232 101.4L232.2 101.3L242.4 97.6L242.5 97.6L242.7 97.5L242.9 97.5L243.2 97.5L243.4 97.5L243.6 97.6L243.7 97.6L243.9 97.7L251.8 102.5L251.9 102.6L252 102.6L252 102.7L252 288.9L252 289L252 289.1L251.9 289.2L251.8 289.3L251.6 289.4L241.5 293.1L241.3 293.2L241.1 293.2L240.9 293.2L240.7 293.2L240.5 293.2L240.3 293.1L240.1 293.1L240 293L232 288.2L231.9 288.2L231.8 288.1L231.8 288Z"/><path class="iso-shade" data-shade="0" d="M252 288.9L252 289L252 102.8L252 102.7ZM252 289L252 289.1L252 102.9L252 102.8ZM252 289.1L251.9 289.2L251.9 103L252 102.9ZM251.9 289.2L251.8 289.3L251.8 103.1L251.9 103ZM251.8 289.3L251.6 289.4L251.6 103.2L251.8 103.1ZM251.6 289.4L241.5 293.1L241.5 106.9L251.6 103.2ZM241.5 293.1L241.3 293.2L241.3 107L241.5 106.9Z"/><path class="iso-shade" data-shade="1" d="M241.3 293.2L241.1 293.2L241.1 107L241.3 107ZM241.1 293.2L240.9 293.2L240.9 107L241.1 107Z"/><path class="iso-shade" data-shade="2" d="M240.9 293.2L240.7 293.2L240.7 107L240.9 107ZM240.7 293.2L240.5 293.2L240.5 107L240.7 107ZM240.5 293.2L240.3 293.1L240.3 106.9L240.5 107Z"/><path class="iso-shade" data-shade="3" d="M240.3 293.1L240.1 293.1L240.1 106.9L240.3 106.9ZM240.1 293.1L240 293L240 106.8L240.1 106.9ZM240 293L232 288.2L232 102L240 106.8ZM232 288.2L231.9 288.2L231.9 102L232 102ZM231.9 288.2L231.8 288.1L231.8 101.9L231.9 102ZM231.8 288.1L231.8 288L231.8 101.8L231.8 101.9Z"/><path class="iso-top" d="M251.8 102.5L251.9 102.6L252 102.6L252 102.7L252 102.8L252 102.9L251.9 103L251.8 103.1L251.6 103.2L241.5 106.9L241.3 107L241.1 107L240.9 107L240.7 107L240.5 107L240.3 106.9L240.1 106.9L240 106.8L232 102L231.9 102L231.8 101.9L231.8 101.8L231.8 101.7L231.8 101.6L231.9 101.5L232 101.4L232.2 101.3L242.4 97.6L242.5 97.6L242.7 97.5L242.9 97.5L243.2 97.5L243.4 97.5L243.6 97.6L243.7 97.6L243.9 97.7Z"/><path class="iso-line iso-crease" data-tone="faint" d="M252 102.7L252 102.8L252 102.9L251.9 103L251.8 103.1L251.6 103.2L241.5 106.9L241.3 107L241.1 107L240.9 107L240.7 107L240.5 107L240.3 106.9L240.1 106.9L240 106.8L232 102L231.9 102L231.8 101.9L231.8 101.8"/><path class="iso-line iso-edge" data-tone="mid" d="M231.8 101.8L231.8 101.7L231.8 101.6L231.9 101.5L232 101.4L232.2 101.3L242.4 97.6L242.5 97.6L242.7 97.5L242.9 97.5L243.2 97.5L243.4 97.5L243.6 97.6L243.7 97.6L243.9 97.7L251.8 102.5L251.9 102.6L252 102.6L252 102.7M252 288.9L252 289L252 289.1L251.9 289.2L251.8 289.3L251.6 289.4L241.5 293.1L241.3 293.2L241.1 293.2L240.9 293.2L240.7 293.2L240.5 293.2L240.3 293.1L240.1 293.1L240 293L232 288.2L231.9 288.2L231.8 288.1L231.8 288M252 102.7L252 288.9M231.8 101.8L231.8 288"/></g>
<path class="iso-line" data-tone="lo" d="M 235.97849770039693 290.6295274746765 L 235.97849770039693 104.43287561673984"/>
<g class="iso-solid"><path class="iso-fill" d="M341.7 167.8L341.7 167.7L341.8 167.6L341.9 167.6L342 167.5L342.1 167.4L352.3 163.7L352.5 163.6L352.7 163.6L352.9 163.6L353.1 163.6L353.3 163.6L353.5 163.6L353.7 163.7L353.8 163.8L361.8 168.5L361.9 168.6L362 168.7L362 168.8L362 355L362 355.1L362 355.2L361.9 355.3L361.7 355.4L361.6 355.4L351.4 359.2L351.2 359.2L351 359.3L350.8 359.3L350.6 359.3L350.4 359.3L350.2 359.2L350.1 359.2L349.9 359.1L342 354.3L341.9 354.2L341.8 354.1L341.7 354Z"/><path class="iso-shade" data-shade="0" d="M362 355L362 355.1L362 168.9L362 168.8ZM362 355.1L362 355.2L362 169L362 168.9ZM362 355.2L361.9 355.3L361.9 169.1L362 169ZM361.9 355.3L361.7 355.4L361.7 169.2L361.9 169.1ZM361.7 355.4L361.6 355.4L361.6 169.3L361.7 169.2ZM361.6 355.4L351.4 359.2L351.4 173L361.6 169.3ZM351.4 359.2L351.2 359.2L351.2 173L351.4 173Z"/><path class="iso-shade" data-shade="1" d="M351.2 359.2L351 359.3L351 173.1L351.2 173ZM351 359.3L350.8 359.3L350.8 173.1L351 173.1Z"/><path class="iso-shade" data-shade="2" d="M350.8 359.3L350.6 359.3L350.6 173.1L350.8 173.1ZM350.6 359.3L350.4 359.3L350.4 173.1L350.6 173.1ZM350.4 359.3L350.2 359.2L350.2 173L350.4 173.1Z"/><path class="iso-shade" data-shade="3" d="M350.2 359.2L350.1 359.2L350.1 173L350.2 173ZM350.1 359.2L349.9 359.1L349.9 172.9L350.1 173ZM349.9 359.1L342 354.3L342 168.1L349.9 172.9ZM342 354.3L341.9 354.2L341.9 168L342 168.1ZM341.9 354.2L341.8 354.1L341.8 167.9L341.9 168ZM341.8 354.1L341.7 354L341.7 167.8L341.8 167.9Z"/><path class="iso-top" d="M361.8 168.5L361.9 168.6L362 168.7L362 168.8L362 168.9L362 169L361.9 169.1L361.7 169.2L361.6 169.3L351.4 173L351.2 173L351 173.1L350.8 173.1L350.6 173.1L350.4 173.1L350.2 173L350.1 173L349.9 172.9L342 168.1L341.9 168L341.8 167.9L341.7 167.8L341.7 167.7L341.8 167.6L341.9 167.6L342 167.5L342.1 167.4L352.3 163.7L352.5 163.6L352.7 163.6L352.9 163.6L353.1 163.6L353.3 163.6L353.5 163.6L353.7 163.7L353.8 163.8Z"/><path class="iso-line iso-crease" data-tone="faint" d="M362 168.8L362 168.9L362 169L361.9 169.1L361.7 169.2L361.6 169.3L351.4 173L351.2 173L351 173.1L350.8 173.1L350.6 173.1L350.4 173.1L350.2 173L350.1 173L349.9 172.9L342 168.1L341.9 168L341.8 167.9L341.7 167.8"/><path class="iso-line iso-edge" data-tone="mid" d="M341.7 167.8L341.7 167.7L341.8 167.6L341.9 167.6L342 167.5L342.1 167.4L352.3 163.7L352.5 163.6L352.7 163.6L352.9 163.6L353.1 163.6L353.3 163.6L353.5 163.6L353.7 163.7L353.8 163.8L361.8 168.5L361.9 168.6L362 168.7L362 168.8M362 355L362 355.1L362 355.2L361.9 355.3L361.7 355.4L361.6 355.4L351.4 359.2L351.2 359.2L351 359.3L350.8 359.3L350.6 359.3L350.4 359.3L350.2 359.2L350.1 359.2L349.9 359.1L342 354.3L341.9 354.2L341.8 354.1L341.7 354M362 168.8L362 355M341.7 167.8L341.7 354"/></g>
<path class="iso-line" data-tone="lo" d="M 345.93753675376945 356.70349601501255 L 345.93753675376945 170.50684415707588"/>
<g class="iso-solid"><path class="iso-fill" d="M356.1 63.8L356.2 63.7L356.2 63.6L356.3 63.5L356.4 63.4L356.6 63.4L359.9 62.1L360.1 62.1L360.3 62L360.5 62L360.7 62L360.9 62L361.1 62.1L361.3 62.1L361.5 62.2L471.4 128.3L471.5 128.4L471.6 128.5L471.6 128.6L471.6 311L471.6 311.1L471.6 311.1L471.5 311.2L471.4 311.3L471.2 311.4L467.8 312.6L467.7 312.7L467.5 312.7L467.3 312.7L467 312.7L466.8 312.7L466.6 312.7L466.5 312.6L466.3 312.5L356.4 246.5L356.3 246.4L356.2 246.3L356.1 246.2Z"/><path class="iso-shade" data-shade="0" d="M471.6 311L471.6 311.1L471.6 128.7L471.6 128.6ZM471.6 311.1L471.6 311.1L471.6 128.8L471.6 128.7ZM471.6 311.1L471.5 311.2L471.5 128.8L471.6 128.8ZM471.5 311.2L471.4 311.3L471.4 128.9L471.5 128.8ZM471.4 311.3L471.2 311.4L471.2 129L471.4 128.9ZM471.2 311.4L467.8 312.6L467.8 130.2L471.2 129ZM467.8 312.6L467.7 312.7L467.7 130.3L467.8 130.2Z"/><path class="iso-shade" data-shade="1" d="M467.7 312.7L467.5 312.7L467.5 130.3L467.7 130.3ZM467.5 312.7L467.3 312.7L467.3 130.3L467.5 130.3Z"/><path class="iso-shade" data-shade="2" d="M467.3 312.7L467 312.7L467 130.3L467.3 130.3ZM467 312.7L466.8 312.7L466.8 130.3L467 130.3ZM466.8 312.7L466.6 312.7L466.6 130.3L466.8 130.3Z"/><path class="iso-shade" data-shade="3" d="M466.6 312.7L466.5 312.6L466.5 130.2L466.6 130.3ZM466.5 312.6L466.3 312.5L466.3 130.1L466.5 130.2ZM466.3 312.5L356.4 246.5L356.4 64.1L466.3 130.1ZM356.4 246.5L356.3 246.4L356.3 64L356.4 64.1ZM356.3 246.4L356.2 246.3L356.2 63.9L356.3 64ZM356.2 246.3L356.1 246.2L356.1 63.8L356.2 63.9Z"/><path class="iso-top" d="M471.4 128.3L471.5 128.4L471.6 128.5L471.6 128.6L471.6 128.7L471.6 128.8L471.5 128.8L471.4 128.9L471.2 129L467.8 130.2L467.7 130.3L467.5 130.3L467.3 130.3L467 130.3L466.8 130.3L466.6 130.3L466.5 130.2L466.3 130.1L356.4 64.1L356.3 64L356.2 63.9L356.1 63.8L356.2 63.7L356.2 63.6L356.3 63.5L356.4 63.4L356.6 63.4L359.9 62.1L360.1 62.1L360.3 62L360.5 62L360.7 62L360.9 62L361.1 62.1L361.3 62.1L361.5 62.2Z"/><path class="iso-line iso-crease" data-tone="faint" d="M471.6 128.6L471.6 128.7L471.6 128.8L471.5 128.8L471.4 128.9L471.2 129L467.8 130.2L467.7 130.3L467.5 130.3L467.3 130.3L467 130.3L466.8 130.3L466.6 130.3L466.5 130.2L466.3 130.1L356.4 64.1L356.3 64L356.2 63.9L356.1 63.8"/><path class="iso-line iso-edge" data-tone="lo" d="M356.1 63.8L356.2 63.7L356.2 63.6L356.3 63.5L356.4 63.4L356.6 63.4L359.9 62.1L360.1 62.1L360.3 62L360.5 62L360.7 62L360.9 62L361.1 62.1L361.3 62.1L361.5 62.2L471.4 128.3L471.5 128.4L471.6 128.5L471.6 128.6M471.6 311L471.6 311.1L471.6 311.1L471.5 311.2L471.4 311.3L471.2 311.4L467.8 312.6L467.7 312.7L467.5 312.7L467.3 312.7L467 312.7L466.8 312.7L466.6 312.7L466.5 312.6L466.3 312.5L356.4 246.5L356.3 246.4L356.2 246.3L356.1 246.2M471.6 128.6L471.6 311M356.1 63.8L356.1 246.2"/></g>
<g class="iso-solid"><path class="iso-fill" d="M230.1 96.3L230.1 95.9L230.3 95.5L230.6 95.1L231.1 94.8L231.7 94.5L355.5 49.1L356.2 48.9L357 48.8L357.8 48.7L358.7 48.7L359.5 48.8L360.3 49L361 49.2L361.5 49.5L478.1 119.5L478.6 119.9L478.9 120.2L479 120.6L479 126.3L479 126.7L478.8 127.1L478.5 127.5L478 127.8L477.4 128.1L353.6 173.5L352.9 173.7L352.1 173.8L351.3 173.9L350.4 173.9L349.6 173.8L348.8 173.6L348.1 173.4L347.6 173.1L231 103.1L230.5 102.7L230.2 102.4L230.1 102Z"/><path class="iso-shade" data-shade="0" d="M479 126.3L479 126.7L479 121L479 120.6ZM479 126.7L478.8 127.1L478.8 121.4L479 121ZM478.8 127.1L478.5 127.5L478.5 121.8L478.8 121.4ZM478.5 127.5L478 127.8L478 122.1L478.5 121.8ZM478 127.8L477.4 128.1L477.4 122.4L478 122.1ZM477.4 128.1L353.6 173.5L353.6 167.8L477.4 122.4ZM353.6 173.5L352.9 173.7L352.9 168L353.6 167.8Z"/><path class="iso-shade" data-shade="1" d="M352.9 173.7L352.1 173.8L352.1 168.1L352.9 168ZM352.1 173.8L351.3 173.9L351.3 168.2L352.1 168.1Z"/><path class="iso-shade" data-shade="2" d="M351.3 173.9L350.4 173.9L350.4 168.2L351.3 168.2ZM350.4 173.9L349.6 173.8L349.6 168.1L350.4 168.2ZM349.6 173.8L348.8 173.6L348.8 167.9L349.6 168.1Z"/><path class="iso-shade" data-shade="3" d="M348.8 173.6L348.1 173.4L348.1 167.7L348.8 167.9ZM348.1 173.4L347.6 173.1L347.6 167.4L348.1 167.7ZM347.6 173.1L231 103.1L231 97.4L347.6 167.4ZM231 103.1L230.5 102.7L230.5 97L231 97.4ZM230.5 102.7L230.2 102.4L230.2 96.7L230.5 97ZM230.2 102.4L230.1 102L230.1 96.3L230.2 96.7Z"/><path class="iso-top" d="M478.1 119.5L478.6 119.9L478.9 120.2L479 120.6L479 121L478.8 121.4L478.5 121.8L478 122.1L477.4 122.4L353.6 167.8L352.9 168L352.1 168.1L351.3 168.2L350.4 168.2L349.6 168.1L348.8 167.9L348.1 167.7L347.6 167.4L231 97.4L230.5 97L230.2 96.7L230.1 96.3L230.1 95.9L230.3 95.5L230.6 95.1L231.1 94.8L231.7 94.5L355.5 49.1L356.2 48.9L357 48.8L357.8 48.7L358.7 48.7L359.5 48.8L360.3 49L361 49.2L361.5 49.5Z"/><path class="iso-line iso-crease" data-tone="faint" d="M479 120.6L479 121L478.8 121.4L478.5 121.8L478 122.1L477.4 122.4L353.6 167.8L352.9 168L352.1 168.1L351.3 168.2L350.4 168.2L349.6 168.1L348.8 167.9L348.1 167.7L347.6 167.4L231 97.4L230.5 97L230.2 96.7L230.1 96.3"/><path class="iso-line iso-edge" data-tone="hi" d="M230.1 96.3L230.1 95.9L230.3 95.5L230.6 95.1L231.1 94.8L231.7 94.5L355.5 49.1L356.2 48.9L357 48.8L357.8 48.7L358.7 48.7L359.5 48.8L360.3 49L361 49.2L361.5 49.5L478.1 119.5L478.6 119.9L478.9 120.2L479 120.6M479 126.3L479 126.7L478.8 127.1L478.5 127.5L478 127.8L477.4 128.1L353.6 173.5L352.9 173.7L352.1 173.8L351.3 173.9L350.4 173.9L349.6 173.8L348.8 173.6L348.1 173.4L347.6 173.1L231 103.1L230.5 102.7L230.2 102.4L230.1 102M479 120.6L479 126.3M230.1 96.3L230.1 102"/></g>
<g class="iso-solid"><path class="iso-fill" d="M302.4 89.9L304.1 86.8L307.4 84.1L312.2 81.8L318 80.2L324.5 79.4L331.2 79.4L337.7 80.1L343.6 81.7L348.4 83.9L351.8 86.6L353.6 89.7L353.7 92.9L353.7 94L352 97.1L348.7 99.8L343.9 102.1L338.1 103.7L331.6 104.5L324.9 104.6L318.4 103.8L312.5 102.2L307.7 100L304.3 97.3L302.5 94.2L302.4 91Z"/><path class="iso-shade" data-shade="0" d="M343.9 102.1L338.1 103.7L338.1 102.5L343.9 100.9ZM353.7 94L352 97.1L352 95.9L353.7 92.9ZM352 97.1L348.7 99.8L348.7 98.7L352 95.9ZM348.7 99.8L343.9 102.1L343.9 100.9L348.7 98.7Z"/><path class="iso-shade" data-shade="1" d="M338.1 103.7L331.6 104.5L331.6 103.4L338.1 102.5ZM331.6 104.5L324.9 104.6L324.9 103.4L331.6 103.4Z"/><path class="iso-shade" data-shade="2" d="M324.9 104.6L318.4 103.8L318.4 102.6L324.9 103.4ZM318.4 103.8L312.5 102.2L312.5 101.1L318.4 102.6Z"/><path class="iso-shade" data-shade="3" d="M312.5 102.2L307.7 100L307.7 98.8L312.5 101.1ZM307.7 100L304.3 97.3L304.3 96.1L307.7 98.8ZM304.3 97.3L302.5 94.2L302.5 93.1L304.3 96.1ZM302.5 94.2L302.4 91L302.4 89.9L302.5 93.1Z"/><path class="iso-top" d="M343.9 100.9L338.1 102.5L331.6 103.4L324.9 103.4L318.4 102.6L312.5 101.1L307.7 98.8L304.3 96.1L302.5 93.1L302.4 89.9L304.1 86.8L307.4 84.1L312.2 81.8L318 80.2L324.5 79.4L331.2 79.4L337.7 80.1L343.6 81.7L348.4 83.9L351.8 86.6L353.6 89.7L353.7 92.9L352 95.9L348.7 98.7Z"/><path class="iso-line iso-crease" data-tone="faint" d="M353.7 92.9L352 95.9L348.7 98.7L343.9 100.9L338.1 102.5L331.6 103.4L324.9 103.4L318.4 102.6L312.5 101.1L307.7 98.8L304.3 96.1L302.5 93.1L302.4 89.9"/><path class="iso-line iso-edge" data-tone="lo" d="M302.4 89.9L304.1 86.8L307.4 84.1L312.2 81.8L318 80.2L324.5 79.4L331.2 79.4L337.7 80.1L343.6 81.7L348.4 83.9L351.8 86.6L353.6 89.7L353.7 92.9M353.7 94L352 97.1L348.7 99.8L343.9 102.1L338.1 103.7L331.6 104.5L324.9 104.6L318.4 103.8L312.5 102.2L307.7 100L304.3 97.3L302.5 94.2L302.4 91M302.4 89.9L302.4 91M353.7 92.9L353.7 94"/></g>
<path class="iso-line" data-tone="lo" d="M340 98.5L337.4 99.3L334.7 99.9L331.7 100.3L328.7 100.5L325.7 100.4L322.7 100.1L319.9 99.6L317.2 98.9L314.8 98L312.8 97L311.1 95.8L309.9 94.5L309 93.1L308.7 91.7L308.8 90.3L309.4 88.9L310.5 87.5L312 86.3L313.9 85.2L316.1 84.2L318.7 83.4L321.4 82.8L324.4 82.5L327.4 82.3L330.4 82.4L333.4 82.6L336.2 83.1L338.9 83.8L341.3 84.7L343.3 85.8L345 87L346.2 88.3L347.1 89.7L347.4 91.1L347.3 92.5L346.7 93.9L345.6 95.2L344.1 96.5L342.2 97.6Z"/>
<path class="iso-line" data-tone="lo" d="M334.7 95.4L333.3 95.8L331.7 96.1L330.1 96.3L328.4 96.4L326.7 96.4L325.1 96.2L323.5 96L322 95.6L320.7 95.1L319.6 94.5L318.6 93.8L317.9 93.1L317.5 92.3L317.3 91.6L317.4 90.8L317.7 90L318.3 89.3L319.1 88.6L320.2 87.9L321.4 87.4L322.8 87L324.4 86.6L326 86.4L327.7 86.3L329.4 86.4L331 86.5L332.6 86.8L334.1 87.2L335.4 87.7L336.5 88.3L337.5 88.9L338.2 89.7L338.6 90.4L338.8 91.2L338.7 92L338.4 92.8L337.8 93.5L337 94.2L335.9 94.8Z"/>
<g class="iso-solid"><path class="iso-fill" d="M355.4 121.8L357.1 118.7L360.4 115.9L365.1 113.7L371 112.1L377.4 111.2L384.2 111.2L390.7 112L396.6 113.5L401.4 115.8L404.8 118.5L406.6 121.5L406.7 124.7L406.7 125.8L405 128.9L401.7 131.7L396.9 133.9L391.1 135.5L384.6 136.4L377.9 136.4L371.4 135.6L365.5 134L360.7 131.8L357.3 129.1L355.5 126.1L355.4 122.9Z"/><path class="iso-shade" data-shade="0" d="M396.9 133.9L391.1 135.5L391.1 134.4L396.9 132.8ZM406.7 125.8L405 128.9L405 127.8L406.7 124.7ZM405 128.9L401.7 131.7L401.7 130.5L405 127.8ZM401.7 131.7L396.9 133.9L396.9 132.8L401.7 130.5Z"/><path class="iso-shade" data-shade="1" d="M391.1 135.5L384.6 136.4L384.6 135.2L391.1 134.4ZM384.6 136.4L377.9 136.4L377.9 135.3L384.6 135.2Z"/><path class="iso-shade" data-shade="2" d="M377.9 136.4L371.4 135.6L371.4 134.5L377.9 135.3ZM371.4 135.6L365.5 134L365.5 132.9L371.4 134.5Z"/><path class="iso-shade" data-shade="3" d="M365.5 134L360.7 131.8L360.7 130.7L365.5 132.9ZM360.7 131.8L357.3 129.1L357.3 128L360.7 130.7ZM357.3 129.1L355.5 126.1L355.5 124.9L357.3 128ZM355.5 126.1L355.4 122.9L355.4 121.8L355.5 124.9Z"/><path class="iso-top" d="M396.9 132.8L391.1 134.4L384.6 135.2L377.9 135.3L371.4 134.5L365.5 132.9L360.7 130.7L357.3 128L355.5 124.9L355.4 121.8L357.1 118.7L360.4 115.9L365.1 113.7L371 112.1L377.4 111.2L384.2 111.2L390.7 112L396.6 113.5L401.4 115.8L404.8 118.5L406.6 121.5L406.7 124.7L405 127.8L401.7 130.5Z"/><path class="iso-line iso-crease" data-tone="faint" d="M406.7 124.7L405 127.8L401.7 130.5L396.9 132.8L391.1 134.4L384.6 135.2L377.9 135.3L371.4 134.5L365.5 132.9L360.7 130.7L357.3 128L355.5 124.9L355.4 121.8"/><path class="iso-line iso-edge" data-tone="lo" d="M355.4 121.8L357.1 118.7L360.4 115.9L365.1 113.7L371 112.1L377.4 111.2L384.2 111.2L390.7 112L396.6 113.5L401.4 115.8L404.8 118.5L406.6 121.5L406.7 124.7M406.7 125.8L405 128.9L401.7 131.7L396.9 133.9L391.1 135.5L384.6 136.4L377.9 136.4L371.4 135.6L365.5 134L360.7 131.8L357.3 129.1L355.5 126.1L355.4 122.9M355.4 121.8L355.4 122.9M406.7 124.7L406.7 125.8"/></g>
<path class="iso-line" data-tone="lo" d="M393 130.4L390.4 131.2L387.7 131.8L384.7 132.2L381.7 132.3L378.7 132.3L375.7 132L372.9 131.5L370.2 130.8L367.8 129.9L365.8 128.8L364.1 127.6L362.8 126.3L362 125L361.7 123.5L361.8 122.1L362.4 120.7L363.5 119.4L365 118.1L366.9 117L369.1 116.1L371.7 115.3L374.4 114.7L377.3 114.3L380.4 114.1L383.4 114.2L386.4 114.5L389.2 115L391.9 115.7L394.3 116.6L396.3 117.6L398 118.8L399.2 120.1L400.1 121.5L400.4 122.9L400.3 124.3L399.7 125.7L398.6 127.1L397.1 128.3L395.2 129.4Z"/>
<path class="iso-line" data-tone="lo" d="M387.7 127.2L386.3 127.6L384.7 128L383.1 128.2L381.4 128.3L379.7 128.2L378.1 128.1L376.5 127.8L375 127.4L373.7 126.9L372.6 126.3L371.6 125.7L370.9 125L370.5 124.2L370.3 123.4L370.4 122.6L370.7 121.8L371.3 121.1L372.1 120.4L373.2 119.8L374.4 119.2L375.8 118.8L377.4 118.5L379 118.3L380.7 118.2L382.4 118.2L384 118.4L385.6 118.7L387.1 119L388.4 119.5L389.5 120.1L390.5 120.8L391.2 121.5L391.6 122.3L391.8 123.1L391.7 123.8L391.4 124.6L390.8 125.4L390 126.1L388.9 126.7Z"/>
<g class="iso-solid"><path class="iso-fill" d="M240.7 104L240.7 103.9L240.7 103.8L240.8 103.7L240.9 103.6L241.1 103.6L242.8 103L243 102.9L243.2 102.9L243.4 102.8L243.6 102.9L243.8 102.9L244 102.9L244.2 103L244.3 103L302.6 138.1L302.7 138.2L302.8 138.2L302.8 138.3L302.8 142.1L302.8 142.2L302.8 142.3L302.7 142.4L302.6 142.5L302.4 142.6L300.7 143.2L300.5 143.3L300.3 143.3L300.1 143.3L299.9 143.3L299.7 143.3L299.5 143.2L299.3 143.2L299.2 143.1L240.9 108.1L240.8 108L240.7 107.9L240.7 107.8Z"/><path class="iso-shade" data-shade="0" d="M302.8 142.1L302.8 142.2L302.8 138.4L302.8 138.3ZM302.8 142.2L302.8 142.3L302.8 138.5L302.8 138.4ZM302.8 142.3L302.7 142.4L302.7 138.6L302.8 138.5ZM302.7 142.4L302.6 142.5L302.6 138.7L302.7 138.6ZM302.6 142.5L302.4 142.6L302.4 138.8L302.6 138.7ZM302.4 142.6L300.7 143.2L300.7 139.4L302.4 138.8ZM300.7 143.2L300.5 143.3L300.5 139.5L300.7 139.4Z"/><path class="iso-shade" data-shade="1" d="M300.5 143.3L300.3 143.3L300.3 139.5L300.5 139.5ZM300.3 143.3L300.1 143.3L300.1 139.5L300.3 139.5Z"/><path class="iso-shade" data-shade="2" d="M300.1 143.3L299.9 143.3L299.9 139.5L300.1 139.5ZM299.9 143.3L299.7 143.3L299.7 139.5L299.9 139.5ZM299.7 143.3L299.5 143.2L299.5 139.4L299.7 139.5Z"/><path class="iso-shade" data-shade="3" d="M299.5 143.2L299.3 143.2L299.3 139.4L299.5 139.4ZM299.3 143.2L299.2 143.1L299.2 139.3L299.3 139.4ZM299.2 143.1L240.9 108.1L240.9 104.3L299.2 139.3ZM240.9 108.1L240.8 108L240.8 104.2L240.9 104.3ZM240.8 108L240.7 107.9L240.7 104.1L240.8 104.2ZM240.7 107.9L240.7 107.8L240.7 104L240.7 104.1Z"/><path class="iso-top" d="M302.6 138.1L302.7 138.2L302.8 138.2L302.8 138.3L302.8 138.4L302.8 138.5L302.7 138.6L302.6 138.7L302.4 138.8L300.7 139.4L300.5 139.5L300.3 139.5L300.1 139.5L299.9 139.5L299.7 139.5L299.5 139.4L299.3 139.4L299.2 139.3L240.9 104.3L240.8 104.2L240.7 104.1L240.7 104L240.7 103.9L240.7 103.8L240.8 103.7L240.9 103.6L241.1 103.6L242.8 103L243 102.9L243.2 102.9L243.4 102.8L243.6 102.9L243.8 102.9L244 102.9L244.2 103L244.3 103Z"/><path class="iso-line iso-crease" data-tone="faint" d="M302.8 138.3L302.8 138.4L302.8 138.5L302.7 138.6L302.6 138.7L302.4 138.8L300.7 139.4L300.5 139.5L300.3 139.5L300.1 139.5L299.9 139.5L299.7 139.5L299.5 139.4L299.3 139.4L299.2 139.3L240.9 104.3L240.8 104.2L240.7 104.1L240.7 104"/><path class="iso-line iso-edge" data-tone="hi" d="M240.7 104L240.7 103.9L240.7 103.8L240.8 103.7L240.9 103.6L241.1 103.6L242.8 103L243 102.9L243.2 102.9L243.4 102.8L243.6 102.9L243.8 102.9L244 102.9L244.2 103L244.3 103L302.6 138.1L302.7 138.2L302.8 138.2L302.8 138.3M302.8 142.1L302.8 142.2L302.8 142.3L302.7 142.4L302.6 142.5L302.4 142.6L300.7 143.2L300.5 143.3L300.3 143.3L300.1 143.3L299.9 143.3L299.7 143.3L299.5 143.2L299.3 143.2L299.2 143.1L240.9 108.1L240.8 108L240.7 107.9L240.7 107.8M302.8 138.3L302.8 142.1M240.7 104L240.7 107.8"/></g>
<g class="iso-solid"><path class="iso-fill" d="M412.5 399.4L412.5 399L412.7 398.7L413.1 398.3L413.6 398L414.2 397.7L541.3 351.1L542.1 350.8L542.8 350.7L543.7 350.6L544.5 350.6L545.3 350.7L546.1 350.9L546.8 351.1L547.4 351.4L666.6 423L667.1 423.4L667.4 423.8L667.5 424.1L667.5 427.9L667.5 428.3L667.3 428.7L667 429.1L666.5 429.4L665.9 429.7L538.7 476.3L538 476.5L537.2 476.7L536.4 476.8L535.5 476.7L534.7 476.7L533.9 476.5L533.2 476.3L532.7 476L413.4 404.3L413 404L412.7 403.6L412.5 403.2Z"/><path class="iso-shade" data-shade="0" d="M667.5 427.9L667.5 428.3L667.5 424.5L667.5 424.1ZM667.5 428.3L667.3 428.7L667.3 424.9L667.5 424.5ZM667.3 428.7L667 429.1L667 425.3L667.3 424.9ZM667 429.1L666.5 429.4L666.5 425.6L667 425.3ZM666.5 429.4L665.9 429.7L665.9 425.9L666.5 425.6ZM665.9 429.7L538.7 476.3L538.7 472.5L665.9 425.9ZM538.7 476.3L538 476.5L538 472.7L538.7 472.5Z"/><path class="iso-shade" data-shade="1" d="M538 476.5L537.2 476.7L537.2 472.9L538 472.7ZM537.2 476.7L536.4 476.8L536.4 473L537.2 472.9Z"/><path class="iso-shade" data-shade="2" d="M536.4 476.8L535.5 476.7L535.5 472.9L536.4 473ZM535.5 476.7L534.7 476.7L534.7 472.9L535.5 472.9ZM534.7 476.7L533.9 476.5L533.9 472.7L534.7 472.9Z"/><path class="iso-shade" data-shade="3" d="M533.9 476.5L533.2 476.3L533.2 472.5L533.9 472.7ZM533.2 476.3L532.7 476L532.7 472.2L533.2 472.5ZM532.7 476L413.4 404.3L413.4 400.5L532.7 472.2ZM413.4 404.3L413 404L413 400.2L413.4 400.5ZM413 404L412.7 403.6L412.7 399.8L413 400.2ZM412.7 403.6L412.5 403.2L412.5 399.4L412.7 399.8Z"/><path class="iso-top" d="M666.6 423L667.1 423.4L667.4 423.8L667.5 424.1L667.5 424.5L667.3 424.9L667 425.3L666.5 425.6L665.9 425.9L538.7 472.5L538 472.7L537.2 472.9L536.4 473L535.5 472.9L534.7 472.9L533.9 472.7L533.2 472.5L532.7 472.2L413.4 400.5L413 400.2L412.7 399.8L412.5 399.4L412.5 399L412.7 398.7L413.1 398.3L413.6 398L414.2 397.7L541.3 351.1L542.1 350.8L542.8 350.7L543.7 350.6L544.5 350.6L545.3 350.7L546.1 350.9L546.8 351.1L547.4 351.4Z"/><path class="iso-line iso-crease" data-tone="faint" d="M667.5 424.1L667.5 424.5L667.3 424.9L667 425.3L666.5 425.6L665.9 425.9L538.7 472.5L538 472.7L537.2 472.9L536.4 473L535.5 472.9L534.7 472.9L533.9 472.7L533.2 472.5L532.7 472.2L413.4 400.5L413 400.2L412.7 399.8L412.5 399.4"/><path class="iso-line iso-edge" data-tone="lo" d="M412.5 399.4L412.5 399L412.7 398.7L413.1 398.3L413.6 398L414.2 397.7L541.3 351.1L542.1 350.8L542.8 350.7L543.7 350.6L544.5 350.6L545.3 350.7L546.1 350.9L546.8 351.1L547.4 351.4L666.6 423L667.1 423.4L667.4 423.8L667.5 424.1M667.5 427.9L667.5 428.3L667.3 428.7L667 429.1L666.5 429.4L665.9 429.7L538.7 476.3L538 476.5L537.2 476.7L536.4 476.8L535.5 476.7L534.7 476.7L533.9 476.5L533.2 476.3L532.7 476L413.4 404.3L413 404L412.7 403.6L412.5 403.2M667.5 424.1L667.5 427.9M412.5 399.4L412.5 403.2"/></g>
<g class="iso-solid"><path class="iso-fill" d="M532.6 170.9L532.6 170.8L532.6 170.7L532.7 170.6L532.8 170.6L533 170.5L543.1 166.8L543.3 166.7L543.5 166.7L543.7 166.7L543.9 166.7L544.1 166.7L544.3 166.7L544.5 166.8L544.7 166.8L552.6 171.6L552.7 171.7L552.8 171.8L552.8 171.9L552.8 358.1L552.8 358.2L552.8 358.3L552.7 358.4L552.6 358.5L552.4 358.5L542.2 362.3L542.1 362.3L541.9 362.4L541.7 362.4L541.4 362.4L541.2 362.3L541.1 362.3L540.9 362.2L540.7 362.2L532.8 357.4L532.7 357.3L532.6 357.2L532.6 357.1Z"/><path class="iso-shade" data-shade="0" d="M552.8 358.1L552.8 358.2L552.8 172L552.8 171.9ZM552.8 358.2L552.8 358.3L552.8 172.1L552.8 172ZM552.8 358.3L552.7 358.4L552.7 172.2L552.8 172.1ZM552.7 358.4L552.6 358.5L552.6 172.3L552.7 172.2ZM552.6 358.5L552.4 358.5L552.4 172.3L552.6 172.3ZM552.4 358.5L542.2 362.3L542.2 176.1L552.4 172.3ZM542.2 362.3L542.1 362.3L542.1 176.1L542.2 176.1Z"/><path class="iso-shade" data-shade="1" d="M542.1 362.3L541.9 362.4L541.9 176.2L542.1 176.1ZM541.9 362.4L541.7 362.4L541.7 176.2L541.9 176.2Z"/><path class="iso-shade" data-shade="2" d="M541.7 362.4L541.4 362.4L541.4 176.2L541.7 176.2ZM541.4 362.4L541.2 362.3L541.2 176.1L541.4 176.2ZM541.2 362.3L541.1 362.3L541.1 176.1L541.2 176.1Z"/><path class="iso-shade" data-shade="3" d="M541.1 362.3L540.9 362.2L540.9 176L541.1 176.1ZM540.9 362.2L540.7 362.2L540.7 176L540.9 176ZM540.7 362.2L532.8 357.4L532.8 171.2L540.7 176ZM532.8 357.4L532.7 357.3L532.7 171.1L532.8 171.2ZM532.7 357.3L532.6 357.2L532.6 171L532.7 171.1ZM532.6 357.2L532.6 357.1L532.6 170.9L532.6 171Z"/><path class="iso-top" d="M552.6 171.6L552.7 171.7L552.8 171.8L552.8 171.9L552.8 172L552.8 172.1L552.7 172.2L552.6 172.3L552.4 172.3L542.2 176.1L542.1 176.1L541.9 176.2L541.7 176.2L541.4 176.2L541.2 176.1L541.1 176.1L540.9 176L540.7 176L532.8 171.2L532.7 171.1L532.6 171L532.6 170.9L532.6 170.8L532.6 170.7L532.7 170.6L532.8 170.6L533 170.5L543.1 166.8L543.3 166.7L543.5 166.7L543.7 166.7L543.9 166.7L544.1 166.7L544.3 166.7L544.5 166.8L544.7 166.8Z"/><path class="iso-line iso-crease" data-tone="faint" d="M552.8 171.9L552.8 172L552.8 172.1L552.7 172.2L552.6 172.3L552.4 172.3L542.2 176.1L542.1 176.1L541.9 176.2L541.7 176.2L541.4 176.2L541.2 176.1L541.1 176.1L540.9 176L540.7 176L532.8 171.2L532.7 171.1L532.6 171L532.6 170.9"/><path class="iso-line iso-edge" data-tone="mid" d="M532.6 170.9L532.6 170.8L532.6 170.7L532.7 170.6L532.8 170.6L533 170.5L543.1 166.8L543.3 166.7L543.5 166.7L543.7 166.7L543.9 166.7L544.1 166.7L544.3 166.7L544.5 166.8L544.7 166.8L552.6 171.6L552.7 171.7L552.8 171.8L552.8 171.9M552.8 358.1L552.8 358.2L552.8 358.3L552.7 358.4L552.6 358.5L552.4 358.5L542.2 362.3L542.1 362.3L541.9 362.4L541.7 362.4L541.4 362.4L541.2 362.3L541.1 362.3L540.9 362.2L540.7 362.2L532.8 357.4L532.7 357.3L532.6 357.2L532.6 357.1M552.8 171.9L552.8 358.1M532.6 170.9L532.6 357.1"/></g>
<path class="iso-line" data-tone="lo" d="M 536.7575796046904 359.7863461009798 L 536.7575796046904 173.58969424304317"/>
<g class="iso-solid"><path class="iso-fill" d="M642.5 237L642.5 236.9L642.6 236.8L642.7 236.7L642.8 236.6L642.9 236.6L653.1 232.8L653.3 232.8L653.5 232.7L653.7 232.7L653.9 232.7L654.1 232.8L654.3 232.8L654.5 232.9L654.6 232.9L662.6 237.7L662.7 237.8L662.7 237.9L662.8 238L662.8 424.2L662.8 424.3L662.7 424.4L662.6 424.5L662.5 424.5L662.4 424.6L652.2 428.3L652 428.4L651.8 428.4L651.6 428.4L651.4 428.4L651.2 428.4L651 428.4L650.8 428.3L650.7 428.2L642.7 423.5L642.6 423.4L642.6 423.3L642.5 423.2Z"/><path class="iso-shade" data-shade="0" d="M662.8 424.2L662.8 424.3L662.8 238.1L662.8 238ZM662.8 424.3L662.7 424.4L662.7 238.2L662.8 238.1ZM662.7 424.4L662.6 424.5L662.6 238.3L662.7 238.2ZM662.6 424.5L662.5 424.5L662.5 238.3L662.6 238.3ZM662.5 424.5L662.4 424.6L662.4 238.4L662.5 238.3ZM662.4 424.6L652.2 428.3L652.2 242.1L662.4 238.4ZM652.2 428.3L652 428.4L652 242.2L652.2 242.1Z"/><path class="iso-shade" data-shade="1" d="M652 428.4L651.8 428.4L651.8 242.2L652 242.2ZM651.8 428.4L651.6 428.4L651.6 242.2L651.8 242.2Z"/><path class="iso-shade" data-shade="2" d="M651.6 428.4L651.4 428.4L651.4 242.2L651.6 242.2ZM651.4 428.4L651.2 428.4L651.2 242.2L651.4 242.2ZM651.2 428.4L651 428.4L651 242.2L651.2 242.2Z"/><path class="iso-shade" data-shade="3" d="M651 428.4L650.8 428.3L650.8 242.1L651 242.2ZM650.8 428.3L650.7 428.2L650.7 242.1L650.8 242.1ZM650.7 428.2L642.7 423.5L642.7 237.3L650.7 242.1ZM642.7 423.5L642.6 423.4L642.6 237.2L642.7 237.3ZM642.6 423.4L642.6 423.3L642.6 237.1L642.6 237.2ZM642.6 423.3L642.5 423.2L642.5 237L642.6 237.1Z"/><path class="iso-top" d="M662.6 237.7L662.7 237.8L662.7 237.9L662.8 238L662.8 238.1L662.7 238.2L662.6 238.3L662.5 238.3L662.4 238.4L652.2 242.1L652 242.2L651.8 242.2L651.6 242.2L651.4 242.2L651.2 242.2L651 242.2L650.8 242.1L650.7 242.1L642.7 237.3L642.6 237.2L642.6 237.1L642.5 237L642.5 236.9L642.6 236.8L642.7 236.7L642.8 236.6L642.9 236.6L653.1 232.8L653.3 232.8L653.5 232.7L653.7 232.7L653.9 232.7L654.1 232.8L654.3 232.8L654.5 232.9L654.6 232.9Z"/><path class="iso-line iso-crease" data-tone="faint" d="M662.8 238L662.8 238.1L662.7 238.2L662.6 238.3L662.5 238.3L662.4 238.4L652.2 242.1L652 242.2L651.8 242.2L651.6 242.2L651.4 242.2L651.2 242.2L651 242.2L650.8 242.1L650.7 242.1L642.7 237.3L642.6 237.2L642.6 237.1L642.5 237"/><path class="iso-line iso-edge" data-tone="mid" d="M642.5 237L642.5 236.9L642.6 236.8L642.7 236.7L642.8 236.6L642.9 236.6L653.1 232.8L653.3 232.8L653.5 232.7L653.7 232.7L653.9 232.7L654.1 232.8L654.3 232.8L654.5 232.9L654.6 232.9L662.6 237.7L662.7 237.8L662.7 237.9L662.8 238M662.8 424.2L662.8 424.3L662.7 424.4L662.6 424.5L662.5 424.5L662.4 424.6L652.2 428.3L652 428.4L651.8 428.4L651.6 428.4L651.4 428.4L651.2 428.4L651 428.4L650.8 428.3L650.7 428.2L642.7 423.5L642.6 423.4L642.6 423.3L642.5 423.2M662.8 238L662.8 424.2M642.5 237L642.5 423.2"/></g>
<path class="iso-line" data-tone="lo" d="M 646.7166186580629 425.8603146413159 L 646.7166186580629 239.6636627833792"/>
<g class="iso-solid"><path class="iso-fill" d="M417.3 213.2L417.3 213.1L417.3 213L417.4 212.9L417.5 212.9L417.7 212.8L427.8 209.1L428 209L428.2 209L428.4 208.9L428.6 209L428.8 209L429 209L429.2 209.1L429.3 209.1L437.3 213.9L437.4 214L437.5 214.1L437.5 214.2L437.5 400.4L437.5 400.5L437.5 400.6L437.4 400.7L437.3 400.8L437.1 400.8L426.9 404.6L426.8 404.6L426.6 404.6L426.4 404.7L426.1 404.7L425.9 404.6L425.7 404.6L425.6 404.5L425.4 404.5L417.5 399.7L417.4 399.6L417.3 399.5L417.3 399.4Z"/><path class="iso-shade" data-shade="0" d="M437.5 400.4L437.5 400.5L437.5 214.3L437.5 214.2ZM437.5 400.5L437.5 400.6L437.5 214.4L437.5 214.3ZM437.5 400.6L437.4 400.7L437.4 214.5L437.5 214.4ZM437.4 400.7L437.3 400.8L437.3 214.6L437.4 214.5ZM437.3 400.8L437.1 400.8L437.1 214.6L437.3 214.6ZM437.1 400.8L426.9 404.6L426.9 218.4L437.1 214.6ZM426.9 404.6L426.8 404.6L426.8 218.4L426.9 218.4Z"/><path class="iso-shade" data-shade="1" d="M426.8 404.6L426.6 404.6L426.6 218.4L426.8 218.4ZM426.6 404.6L426.4 404.7L426.4 218.5L426.6 218.4Z"/><path class="iso-shade" data-shade="2" d="M426.4 404.7L426.1 404.7L426.1 218.5L426.4 218.5ZM426.1 404.7L425.9 404.6L425.9 218.4L426.1 218.5ZM425.9 404.6L425.7 404.6L425.7 218.4L425.9 218.4Z"/><path class="iso-shade" data-shade="3" d="M425.7 404.6L425.6 404.5L425.6 218.3L425.7 218.4ZM425.6 404.5L425.4 404.5L425.4 218.3L425.6 218.3ZM425.4 404.5L417.5 399.7L417.5 213.5L425.4 218.3ZM417.5 399.7L417.4 399.6L417.4 213.4L417.5 213.5ZM417.4 399.6L417.3 399.5L417.3 213.3L417.4 213.4ZM417.3 399.5L417.3 399.4L417.3 213.2L417.3 213.3Z"/><path class="iso-top" d="M437.3 213.9L437.4 214L437.5 214.1L437.5 214.2L437.5 214.3L437.5 214.4L437.4 214.5L437.3 214.6L437.1 214.6L426.9 218.4L426.8 218.4L426.6 218.4L426.4 218.5L426.1 218.5L425.9 218.4L425.7 218.4L425.6 218.3L425.4 218.3L417.5 213.5L417.4 213.4L417.3 213.3L417.3 213.2L417.3 213.1L417.3 213L417.4 212.9L417.5 212.9L417.7 212.8L427.8 209.1L428 209L428.2 209L428.4 208.9L428.6 209L428.8 209L429 209L429.2 209.1L429.3 209.1Z"/><path class="iso-line iso-crease" data-tone="faint" d="M437.5 214.2L437.5 214.3L437.5 214.4L437.4 214.5L437.3 214.6L437.1 214.6L426.9 218.4L426.8 218.4L426.6 218.4L426.4 218.5L426.1 218.5L425.9 218.4L425.7 218.4L425.6 218.3L425.4 218.3L417.5 213.5L417.4 213.4L417.3 213.3L417.3 213.2"/><path class="iso-line iso-edge" data-tone="mid" d="M417.3 213.2L417.3 213.1L417.3 213L417.4 212.9L417.5 212.9L417.7 212.8L427.8 209.1L428 209L428.2 209L428.4 208.9L428.6 209L428.8 209L429 209L429.2 209.1L429.3 209.1L437.3 213.9L437.4 214L437.5 214.1L437.5 214.2M437.5 400.4L437.5 400.5L437.5 400.6L437.4 400.7L437.3 400.8L437.1 400.8L426.9 404.6L426.8 404.6L426.6 404.6L426.4 404.7L426.1 404.7L425.9 404.6L425.7 404.6L425.6 404.5L425.4 404.5L417.5 399.7L417.4 399.6L417.3 399.5L417.3 399.4M437.5 214.2L437.5 400.4M417.3 213.2L417.3 399.4"/></g>
<path class="iso-line" data-tone="lo" d="M 421.45157562174813 402.0795948921108 L 421.45157562174813 215.88294303417413"/>
<g class="iso-solid"><path class="iso-fill" d="M527.2 279.3L527.2 279.2L527.3 279.1L527.3 279L527.5 278.9L527.6 278.9L537.8 275.1L538 275.1L538.2 275L538.4 275L538.6 275L538.8 275L539 275.1L539.2 275.1L539.3 275.2L547.3 280L547.4 280.1L547.4 280.2L547.5 280.3L547.5 466.5L547.5 466.6L547.4 466.7L547.3 466.7L547.2 466.8L547.1 466.9L536.9 470.6L536.7 470.7L536.5 470.7L536.3 470.7L536.1 470.7L535.9 470.7L535.7 470.7L535.5 470.6L535.4 470.5L527.4 465.8L527.3 465.7L527.2 465.6L527.2 465.5Z"/><path class="iso-shade" data-shade="0" d="M547.5 466.5L547.5 466.6L547.5 280.4L547.5 280.3ZM547.5 466.6L547.4 466.7L547.4 280.5L547.5 280.4ZM547.4 466.7L547.3 466.7L547.3 280.6L547.4 280.5ZM547.3 466.7L547.2 466.8L547.2 280.6L547.3 280.6ZM547.2 466.8L547.1 466.9L547.1 280.7L547.2 280.6ZM547.1 466.9L536.9 470.6L536.9 284.4L547.1 280.7ZM536.9 470.6L536.7 470.7L536.7 284.5L536.9 284.4Z"/><path class="iso-shade" data-shade="1" d="M536.7 470.7L536.5 470.7L536.5 284.5L536.7 284.5ZM536.5 470.7L536.3 470.7L536.3 284.5L536.5 284.5Z"/><path class="iso-shade" data-shade="2" d="M536.3 470.7L536.1 470.7L536.1 284.5L536.3 284.5ZM536.1 470.7L535.9 470.7L535.9 284.5L536.1 284.5ZM535.9 470.7L535.7 470.7L535.7 284.5L535.9 284.5Z"/><path class="iso-shade" data-shade="3" d="M535.7 470.7L535.5 470.6L535.5 284.4L535.7 284.5ZM535.5 470.6L535.4 470.5L535.4 284.3L535.5 284.4ZM535.4 470.5L527.4 465.8L527.4 279.6L535.4 284.3ZM527.4 465.8L527.3 465.7L527.3 279.5L527.4 279.6ZM527.3 465.7L527.2 465.6L527.2 279.4L527.3 279.5ZM527.2 465.6L527.2 465.5L527.2 279.3L527.2 279.4Z"/><path class="iso-top" d="M547.3 280L547.4 280.1L547.4 280.2L547.5 280.3L547.5 280.4L547.4 280.5L547.3 280.6L547.2 280.6L547.1 280.7L536.9 284.4L536.7 284.5L536.5 284.5L536.3 284.5L536.1 284.5L535.9 284.5L535.7 284.5L535.5 284.4L535.4 284.3L527.4 279.6L527.3 279.5L527.2 279.4L527.2 279.3L527.2 279.2L527.3 279.1L527.3 279L527.5 278.9L527.6 278.9L537.8 275.1L538 275.1L538.2 275L538.4 275L538.6 275L538.8 275L539 275.1L539.2 275.1L539.3 275.2Z"/><path class="iso-line iso-crease" data-tone="faint" d="M547.5 280.3L547.5 280.4L547.4 280.5L547.3 280.6L547.2 280.6L547.1 280.7L536.9 284.4L536.7 284.5L536.5 284.5L536.3 284.5L536.1 284.5L535.9 284.5L535.7 284.5L535.5 284.4L535.4 284.3L527.4 279.6L527.3 279.5L527.2 279.4L527.2 279.3"/><path class="iso-line iso-edge" data-tone="mid" d="M527.2 279.3L527.2 279.2L527.3 279.1L527.3 279L527.5 278.9L527.6 278.9L537.8 275.1L538 275.1L538.2 275L538.4 275L538.6 275L538.8 275L539 275.1L539.2 275.1L539.3 275.2L547.3 280L547.4 280.1L547.4 280.2L547.5 280.3M547.5 466.5L547.5 466.6L547.4 466.7L547.3 466.7L547.2 466.8L547.1 466.9L536.9 470.6L536.7 470.7L536.5 470.7L536.3 470.7L536.1 470.7L535.9 470.7L535.7 470.7L535.5 470.6L535.4 470.5L527.4 465.8L527.3 465.7L527.2 465.6L527.2 465.5M547.5 280.3L547.5 466.5M527.2 279.3L527.2 465.5"/></g>
<path class="iso-line" data-tone="lo" d="M 531.4106146751207 468.1535634324468 L 531.4106146751207 281.9569115745102"/>
<g class="iso-solid"><path class="iso-fill" d="M541.6 175.3L541.6 175.2L541.7 175.1L541.8 175L541.9 174.9L542 174.8L545.4 173.6L545.6 173.5L545.8 173.5L546 173.5L546.2 173.5L546.4 173.5L546.6 173.5L546.8 173.6L546.9 173.7L656.9 239.7L657 239.8L657.1 239.9L657.1 240L657.1 422.4L657.1 422.5L657.1 422.6L657 422.7L656.9 422.8L656.7 422.8L653.3 424.1L653.1 424.1L652.9 424.2L652.7 424.2L652.5 424.2L652.3 424.2L652.1 424.1L651.9 424.1L651.8 424L541.8 357.9L541.7 357.8L541.7 357.7L541.6 357.6Z"/><path class="iso-shade" data-shade="0" d="M657.1 422.4L657.1 422.5L657.1 240.1L657.1 240ZM657.1 422.5L657.1 422.6L657.1 240.2L657.1 240.1ZM657.1 422.6L657 422.7L657 240.3L657.1 240.2ZM657 422.7L656.9 422.8L656.9 240.4L657 240.3ZM656.9 422.8L656.7 422.8L656.7 240.4L656.9 240.4ZM656.7 422.8L653.3 424.1L653.3 241.7L656.7 240.4ZM653.3 424.1L653.1 424.1L653.1 241.7L653.3 241.7Z"/><path class="iso-shade" data-shade="1" d="M653.1 424.1L652.9 424.2L652.9 241.8L653.1 241.7ZM652.9 424.2L652.7 424.2L652.7 241.8L652.9 241.8Z"/><path class="iso-shade" data-shade="2" d="M652.7 424.2L652.5 424.2L652.5 241.8L652.7 241.8ZM652.5 424.2L652.3 424.2L652.3 241.8L652.5 241.8ZM652.3 424.2L652.1 424.1L652.1 241.7L652.3 241.8Z"/><path class="iso-shade" data-shade="3" d="M652.1 424.1L651.9 424.1L651.9 241.7L652.1 241.7ZM651.9 424.1L651.8 424L651.8 241.6L651.9 241.7ZM651.8 424L541.8 357.9L541.8 175.5L651.8 241.6ZM541.8 357.9L541.7 357.8L541.7 175.4L541.8 175.5ZM541.7 357.8L541.7 357.7L541.7 175.3L541.7 175.4ZM541.7 357.7L541.6 357.6L541.6 175.3L541.7 175.3Z"/><path class="iso-top" d="M656.9 239.7L657 239.8L657.1 239.9L657.1 240L657.1 240.1L657.1 240.2L657 240.3L656.9 240.4L656.7 240.4L653.3 241.7L653.1 241.7L652.9 241.8L652.7 241.8L652.5 241.8L652.3 241.8L652.1 241.7L651.9 241.7L651.8 241.6L541.8 175.5L541.7 175.4L541.7 175.3L541.6 175.3L541.6 175.2L541.7 175.1L541.8 175L541.9 174.9L542 174.8L545.4 173.6L545.6 173.5L545.8 173.5L546 173.5L546.2 173.5L546.4 173.5L546.6 173.5L546.8 173.6L546.9 173.7Z"/><path class="iso-line iso-crease" data-tone="faint" d="M657.1 240L657.1 240.1L657.1 240.2L657 240.3L656.9 240.4L656.7 240.4L653.3 241.7L653.1 241.7L652.9 241.8L652.7 241.8L652.5 241.8L652.3 241.8L652.1 241.7L651.9 241.7L651.8 241.6L541.8 175.5L541.7 175.4L541.7 175.3L541.6 175.3"/><path class="iso-line iso-edge" data-tone="lo" d="M541.6 175.3L541.6 175.2L541.7 175.1L541.8 175L541.9 174.9L542 174.8L545.4 173.6L545.6 173.5L545.8 173.5L546 173.5L546.2 173.5L546.4 173.5L546.6 173.5L546.8 173.6L546.9 173.7L656.9 239.7L657 239.8L657.1 239.9L657.1 240M657.1 422.4L657.1 422.5L657.1 422.6L657 422.7L656.9 422.8L656.7 422.8L653.3 424.1L653.1 424.1L652.9 424.2L652.7 424.2L652.5 424.2L652.3 424.2L652.1 424.1L651.9 424.1L651.8 424L541.8 357.9L541.7 357.8L541.7 357.7L541.6 357.6M657.1 240L657.1 422.4M541.6 175.3L541.6 357.6"/></g>
<g class="iso-solid"><path class="iso-fill" d="M415.5 207.7L415.6 207.3L415.7 206.9L416.1 206.6L416.6 206.3L417.2 206L541 160.6L541.7 160.4L542.5 160.2L543.3 160.2L544.1 160.2L545 160.2L545.7 160.4L546.4 160.6L547 160.9L663.6 231L664 231.3L664.3 231.7L664.5 232.1L664.5 237.8L664.5 238.2L664.3 238.6L663.9 238.9L663.5 239.2L662.9 239.5L539.1 284.9L538.4 285.1L537.6 285.3L536.7 285.3L535.9 285.3L535.1 285.2L534.3 285.1L533.6 284.9L533 284.6L416.4 214.5L416 214.2L415.7 213.8L415.5 213.4Z"/><path class="iso-shade" data-shade="0" d="M664.5 237.8L664.5 238.2L664.5 232.5L664.5 232.1ZM664.5 238.2L664.3 238.6L664.3 232.9L664.5 232.5ZM664.3 238.6L663.9 238.9L663.9 233.2L664.3 232.9ZM663.9 238.9L663.5 239.2L663.5 233.5L663.9 233.2ZM663.5 239.2L662.9 239.5L662.9 233.8L663.5 233.5ZM662.9 239.5L539.1 284.9L539.1 279.2L662.9 233.8ZM539.1 284.9L538.4 285.1L538.4 279.4L539.1 279.2Z"/><path class="iso-shade" data-shade="1" d="M538.4 285.1L537.6 285.3L537.6 279.6L538.4 279.4ZM537.6 285.3L536.7 285.3L536.7 279.6L537.6 279.6Z"/><path class="iso-shade" data-shade="2" d="M536.7 285.3L535.9 285.3L535.9 279.6L536.7 279.6ZM535.9 285.3L535.1 285.2L535.1 279.5L535.9 279.6ZM535.1 285.2L534.3 285.1L534.3 279.4L535.1 279.5Z"/><path class="iso-shade" data-shade="3" d="M534.3 285.1L533.6 284.9L533.6 279.2L534.3 279.4ZM533.6 284.9L533 284.6L533 278.9L533.6 279.2ZM533 284.6L416.4 214.5L416.4 208.8L533 278.9ZM416.4 214.5L416 214.2L416 208.5L416.4 208.8ZM416 214.2L415.7 213.8L415.7 208.1L416 208.5ZM415.7 213.8L415.5 213.4L415.5 207.7L415.7 208.1Z"/><path class="iso-top" d="M663.6 231L664 231.3L664.3 231.7L664.5 232.1L664.5 232.5L664.3 232.9L663.9 233.2L663.5 233.5L662.9 233.8L539.1 279.2L538.4 279.4L537.6 279.6L536.7 279.6L535.9 279.6L535.1 279.5L534.3 279.4L533.6 279.2L533 278.9L416.4 208.8L416 208.5L415.7 208.1L415.5 207.7L415.6 207.3L415.7 206.9L416.1 206.6L416.6 206.3L417.2 206L541 160.6L541.7 160.4L542.5 160.2L543.3 160.2L544.1 160.2L545 160.2L545.7 160.4L546.4 160.6L547 160.9Z"/><path class="iso-line iso-crease" data-tone="faint" d="M664.5 232.1L664.5 232.5L664.3 232.9L663.9 233.2L663.5 233.5L662.9 233.8L539.1 279.2L538.4 279.4L537.6 279.6L536.7 279.6L535.9 279.6L535.1 279.5L534.3 279.4L533.6 279.2L533 278.9L416.4 208.8L416 208.5L415.7 208.1L415.5 207.7"/><path class="iso-line iso-edge" data-tone="hi" d="M415.5 207.7L415.6 207.3L415.7 206.9L416.1 206.6L416.6 206.3L417.2 206L541 160.6L541.7 160.4L542.5 160.2L543.3 160.2L544.1 160.2L545 160.2L545.7 160.4L546.4 160.6L547 160.9L663.6 231L664 231.3L664.3 231.7L664.5 232.1M664.5 237.8L664.5 238.2L664.3 238.6L663.9 238.9L663.5 239.2L662.9 239.5L539.1 284.9L538.4 285.1L537.6 285.3L536.7 285.3L535.9 285.3L535.1 285.2L534.3 285.1L533.6 284.9L533 284.6L416.4 214.5L416 214.2L415.7 213.8L415.5 213.4M664.5 232.1L664.5 237.8M415.5 207.7L415.5 213.4"/></g>
<g class="iso-solid"><path class="iso-fill" d="M487.9 201.4L489.6 198.3L492.9 195.5L497.6 193.3L503.4 191.7L509.9 190.8L516.7 190.8L523.2 191.6L529.1 193.2L533.9 195.4L537.3 198.1L539.1 201.1L539.2 204.3L539.2 205.5L537.5 208.5L534.1 211.3L529.4 213.5L523.6 215.1L517.1 216L510.4 216L503.8 215.2L498 213.7L493.2 211.4L489.8 208.7L488 205.7L487.9 202.5Z"/><path class="iso-shade" data-shade="0" d="M529.4 213.5L523.6 215.1L523.6 214L529.4 212.4ZM539.2 205.5L537.5 208.5L537.5 207.4L539.2 204.3ZM537.5 208.5L534.1 211.3L534.1 210.1L537.5 207.4ZM534.1 211.3L529.4 213.5L529.4 212.4L534.1 210.1Z"/><path class="iso-shade" data-shade="1" d="M523.6 215.1L517.1 216L517.1 214.8L523.6 214ZM517.1 216L510.4 216L510.4 214.9L517.1 214.8Z"/><path class="iso-shade" data-shade="2" d="M510.4 216L503.8 215.2L503.8 214.1L510.4 214.9ZM503.8 215.2L498 213.7L498 212.5L503.8 214.1Z"/><path class="iso-shade" data-shade="3" d="M498 213.7L493.2 211.4L493.2 210.3L498 212.5ZM493.2 211.4L489.8 208.7L489.8 207.6L493.2 210.3ZM489.8 208.7L488 205.7L488 204.5L489.8 207.6ZM488 205.7L487.9 202.5L487.9 201.4L488 204.5Z"/><path class="iso-top" d="M529.4 212.4L523.6 214L517.1 214.8L510.4 214.9L503.8 214.1L498 212.5L493.2 210.3L489.8 207.6L488 204.5L487.9 201.4L489.6 198.3L492.9 195.5L497.6 193.3L503.4 191.7L509.9 190.8L516.7 190.8L523.2 191.6L529.1 193.2L533.9 195.4L537.3 198.1L539.1 201.1L539.2 204.3L537.5 207.4L534.1 210.1Z"/><path class="iso-line iso-crease" data-tone="faint" d="M539.2 204.3L537.5 207.4L534.1 210.1L529.4 212.4L523.6 214L517.1 214.8L510.4 214.9L503.8 214.1L498 212.5L493.2 210.3L489.8 207.6L488 204.5L487.9 201.4"/><path class="iso-line iso-edge" data-tone="lo" d="M487.9 201.4L489.6 198.3L492.9 195.5L497.6 193.3L503.4 191.7L509.9 190.8L516.7 190.8L523.2 191.6L529.1 193.2L533.9 195.4L537.3 198.1L539.1 201.1L539.2 204.3M539.2 205.5L537.5 208.5L534.1 211.3L529.4 213.5L523.6 215.1L517.1 216L510.4 216L503.8 215.2L498 213.7L493.2 211.4L489.8 208.7L488 205.7L487.9 202.5M487.9 201.4L487.9 202.5M539.2 204.3L539.2 205.5"/></g>
<path class="iso-line" data-tone="lo" d="M525.4 210L522.9 210.8L520.1 211.4L517.2 211.8L514.2 211.9L511.2 211.9L508.2 211.6L505.3 211.1L502.7 210.4L500.3 209.5L498.3 208.4L496.6 207.2L495.3 205.9L494.5 204.6L494.2 203.2L494.3 201.7L494.9 200.3L496 199L497.5 197.8L499.4 196.6L501.6 195.7L504.1 194.9L506.9 194.3L509.8 193.9L512.8 193.7L515.9 193.8L518.9 194.1L521.7 194.6L524.4 195.3L526.7 196.2L528.8 197.2L530.5 198.4L531.7 199.7L532.5 201.1L532.9 202.5L532.7 203.9L532.1 205.3L531.1 206.7L529.6 207.9L527.7 209Z"/>
<path class="iso-line" data-tone="lo" d="M520.1 206.8L518.7 207.3L517.2 207.6L515.6 207.8L513.9 207.9L512.2 207.8L510.6 207.7L509 207.4L507.5 207L506.2 206.5L505 205.9L504.1 205.3L503.4 204.6L503 203.8L502.8 203L502.8 202.2L503.2 201.4L503.8 200.7L504.6 200L505.7 199.4L506.9 198.9L508.3 198.4L509.8 198.1L511.5 197.9L513.1 197.8L514.8 197.8L516.5 198L518.1 198.3L519.5 198.6L520.9 199.1L522 199.7L522.9 200.4L523.6 201.1L524.1 201.9L524.3 202.7L524.2 203.5L523.9 204.2L523.3 205L522.4 205.7L521.4 206.3Z"/>
<g class="iso-solid"><path class="iso-fill" d="M540.9 233.2L542.6 230.1L545.9 227.4L550.6 225.1L556.4 223.5L562.9 222.7L569.7 222.6L576.2 223.4L582.1 225L586.9 227.2L590.3 229.9L592.1 233L592.1 236.2L592.1 237.3L590.5 240.4L587.1 243.1L582.4 245.4L576.6 247L570.1 247.8L563.4 247.9L556.8 247.1L551 245.5L546.2 243.3L542.7 240.6L540.9 237.5L540.9 234.3Z"/><path class="iso-shade" data-shade="0" d="M582.4 245.4L576.6 247L576.6 245.8L582.4 244.2ZM592.1 237.3L590.5 240.4L590.5 239.2L592.1 236.2ZM590.5 240.4L587.1 243.1L587.1 242L590.5 239.2ZM587.1 243.1L582.4 245.4L582.4 244.2L587.1 242Z"/><path class="iso-shade" data-shade="1" d="M576.6 247L570.1 247.8L570.1 246.7L576.6 245.8ZM570.1 247.8L563.4 247.9L563.4 246.7L570.1 246.7Z"/><path class="iso-shade" data-shade="2" d="M563.4 247.9L556.8 247.1L556.8 245.9L563.4 246.7ZM556.8 247.1L551 245.5L551 244.4L556.8 245.9Z"/><path class="iso-shade" data-shade="3" d="M551 245.5L546.2 243.3L546.2 242.1L551 244.4ZM546.2 243.3L542.7 240.6L542.7 239.4L546.2 242.1ZM542.7 240.6L540.9 237.5L540.9 236.4L542.7 239.4ZM540.9 237.5L540.9 234.3L540.9 233.2L540.9 236.4Z"/><path class="iso-top" d="M582.4 244.2L576.6 245.8L570.1 246.7L563.4 246.7L556.8 245.9L551 244.4L546.2 242.1L542.7 239.4L540.9 236.4L540.9 233.2L542.6 230.1L545.9 227.4L550.6 225.1L556.4 223.5L562.9 222.7L569.7 222.6L576.2 223.4L582.1 225L586.9 227.2L590.3 229.9L592.1 233L592.1 236.2L590.5 239.2L587.1 242Z"/><path class="iso-line iso-crease" data-tone="faint" d="M592.1 236.2L590.5 239.2L587.1 242L582.4 244.2L576.6 245.8L570.1 246.7L563.4 246.7L556.8 245.9L551 244.4L546.2 242.1L542.7 239.4L540.9 236.4L540.9 233.2"/><path class="iso-line iso-edge" data-tone="lo" d="M540.9 233.2L542.6 230.1L545.9 227.4L550.6 225.1L556.4 223.5L562.9 222.7L569.7 222.6L576.2 223.4L582.1 225L586.9 227.2L590.3 229.9L592.1 233L592.1 236.2M592.1 237.3L590.5 240.4L587.1 243.1L582.4 245.4L576.6 247L570.1 247.8L563.4 247.9L556.8 247.1L551 245.5L546.2 243.3L542.7 240.6L540.9 237.5L540.9 234.3M540.9 233.2L540.9 234.3M592.1 236.2L592.1 237.3"/></g>
<path class="iso-line" data-tone="lo" d="M578.4 241.8L575.9 242.6L573.1 243.2L570.2 243.6L567.2 243.8L564.2 243.7L561.2 243.4L558.3 242.9L555.7 242.2L553.3 241.3L551.3 240.3L549.6 239.1L548.3 237.8L547.5 236.4L547.2 235L547.3 233.6L547.9 232.2L549 230.8L550.5 229.6L552.4 228.5L554.6 227.5L557.1 226.7L559.9 226.1L562.8 225.8L565.8 225.6L568.9 225.7L571.9 225.9L574.7 226.4L577.3 227.1L579.7 228L581.8 229.1L583.5 230.3L584.7 231.6L585.5 232.9L585.9 234.4L585.7 235.8L585.1 237.2L584.1 238.5L582.6 239.8L580.7 240.9Z"/>
<path class="iso-line" data-tone="lo" d="M573.1 238.7L571.7 239.1L570.2 239.4L568.6 239.6L566.9 239.7L565.2 239.7L563.5 239.5L562 239.3L560.5 238.9L559.2 238.4L558 237.8L557.1 237.1L556.4 236.4L556 235.6L555.8 234.9L555.8 234.1L556.2 233.3L556.8 232.5L557.6 231.9L558.6 231.2L559.9 230.7L561.3 230.3L562.8 229.9L564.5 229.7L566.1 229.6L567.8 229.7L569.5 229.8L571.1 230.1L572.5 230.5L573.9 231L575 231.6L575.9 232.2L576.6 233L577.1 233.7L577.3 234.5L577.2 235.3L576.9 236.1L576.3 236.8L575.4 237.5L574.4 238.1Z"/>
<g class="iso-solid"><path class="iso-fill" d="M426.2 215.5L426.2 215.4L426.2 215.3L426.3 215.2L426.4 215.1L426.6 215L428.3 214.4L428.4 214.4L428.6 214.3L428.8 214.3L429.1 214.3L429.3 214.3L429.5 214.4L429.6 214.4L429.8 214.5L488.1 249.5L488.2 249.6L488.3 249.7L488.3 249.8L488.3 253.6L488.3 253.7L488.2 253.8L488.2 253.9L488 254L487.9 254L486.2 254.6L486 254.7L485.8 254.7L485.6 254.8L485.4 254.8L485.2 254.7L485 254.7L484.8 254.6L484.7 254.6L426.4 219.5L426.3 219.5L426.2 219.4L426.2 219.3Z"/><path class="iso-shade" data-shade="0" d="M488.3 253.6L488.3 253.7L488.3 249.9L488.3 249.8ZM488.3 253.7L488.2 253.8L488.2 250L488.3 249.9ZM488.2 253.8L488.2 253.9L488.2 250.1L488.2 250ZM488.2 253.9L488 254L488 250.2L488.2 250.1ZM488 254L487.9 254L487.9 250.2L488 250.2ZM487.9 254L486.2 254.6L486.2 250.8L487.9 250.2ZM486.2 254.6L486 254.7L486 250.9L486.2 250.8Z"/><path class="iso-shade" data-shade="1" d="M486 254.7L485.8 254.7L485.8 250.9L486 250.9ZM485.8 254.7L485.6 254.8L485.6 251L485.8 250.9Z"/><path class="iso-shade" data-shade="2" d="M485.6 254.8L485.4 254.8L485.4 251L485.6 251ZM485.4 254.8L485.2 254.7L485.2 250.9L485.4 251ZM485.2 254.7L485 254.7L485 250.9L485.2 250.9Z"/><path class="iso-shade" data-shade="3" d="M485 254.7L484.8 254.6L484.8 250.8L485 250.9ZM484.8 254.6L484.7 254.6L484.7 250.8L484.8 250.8ZM484.7 254.6L426.4 219.5L426.4 215.7L484.7 250.8ZM426.4 219.5L426.3 219.5L426.3 215.7L426.4 215.7ZM426.3 219.5L426.2 219.4L426.2 215.6L426.3 215.7ZM426.2 219.4L426.2 219.3L426.2 215.5L426.2 215.6Z"/><path class="iso-top" d="M488.1 249.5L488.2 249.6L488.3 249.7L488.3 249.8L488.3 249.9L488.2 250L488.2 250.1L488 250.2L487.9 250.2L486.2 250.8L486 250.9L485.8 250.9L485.6 251L485.4 251L485.2 250.9L485 250.9L484.8 250.8L484.7 250.8L426.4 215.7L426.3 215.7L426.2 215.6L426.2 215.5L426.2 215.4L426.2 215.3L426.3 215.2L426.4 215.1L426.6 215L428.3 214.4L428.4 214.4L428.6 214.3L428.8 214.3L429.1 214.3L429.3 214.3L429.5 214.4L429.6 214.4L429.8 214.5Z"/><path class="iso-line iso-crease" data-tone="faint" d="M488.3 249.8L488.3 249.9L488.2 250L488.2 250.1L488 250.2L487.9 250.2L486.2 250.8L486 250.9L485.8 250.9L485.6 251L485.4 251L485.2 250.9L485 250.9L484.8 250.8L484.7 250.8L426.4 215.7L426.3 215.7L426.2 215.6L426.2 215.5"/><path class="iso-line iso-edge" data-tone="hi" d="M426.2 215.5L426.2 215.4L426.2 215.3L426.3 215.2L426.4 215.1L426.6 215L428.3 214.4L428.4 214.4L428.6 214.3L428.8 214.3L429.1 214.3L429.3 214.3L429.5 214.4L429.6 214.4L429.8 214.5L488.1 249.5L488.2 249.6L488.3 249.7L488.3 249.8M488.3 253.6L488.3 253.7L488.2 253.8L488.2 253.9L488 254L487.9 254L486.2 254.6L486 254.7L485.8 254.7L485.6 254.8L485.4 254.8L485.2 254.7L485 254.7L484.8 254.6L484.7 254.6L426.4 219.5L426.3 219.5L426.2 219.4L426.2 219.3M488.3 249.8L488.3 253.6M426.2 215.5L426.2 219.3"/></g>
<g class="blade-unit" data-node-id="node-01" tabindex="0" role="button" aria-label="gpu-cluster">
<path class="blade-top" d="M 358.5441772348407 212.75610716487773 L 465.8536008893367 277.2379318849647 L 350.5475969063944 319.53118067609563 L 243.23817325189836 255.04935595600864 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 465.8536008893367 300.0375219083855 L 350.5475969063944 342.33077069951645 L 350.5475969063944 319.53118067609563 L 465.8536008893367 277.2379318849647 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 243.23817325189836 277.84894597942946 L 350.5475969063944 342.33077069951645 L 350.5475969063944 319.53118067609563 L 243.23817325189836 255.04935595600864 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 241.9133655524601 277.05287406930495 L 351.87240460583257 343.12684260964096" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 249.77742792263143 277.11048891889175 L 322.64185139173367 320.89444397574096" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 272.36057433067907 L 322.64185139173367 316.1445293875282" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 267.6106597424664 L 322.64185139173367 311.3946147993156" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="247.0430286972969" cy="268.89956265219723" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="346.40360615516363" cy="328.60495591153705" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="327.8562983630285" cy="317.4599491697936" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="333.1555291607814" cy="320.6442368102917" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="338.4547599585343" cy="323.82852445078987" r="2.2" fill="#3FB950"/>
<path d="M 251.10223562206966 263.6568170643783 L 261.70069721757545 270.0253923453745" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="blade-unit" data-node-id="node-02" tabindex="0" role="button" aria-label="gpu-cluster2">
<path class="blade-top" d="M 358.5441772348407 183.30663671795918 L 465.8536008893367 247.78846143804614 L 350.5475969063944 290.0817102291771 L 243.23817325189836 225.5998855090901 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 465.8536008893367 270.588051461467 L 350.5475969063944 312.8813002525979 L 350.5475969063944 290.0817102291771 L 465.8536008893367 247.78846143804614 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 243.23817325189836 248.3994755325109 L 350.5475969063944 312.8813002525979 L 350.5475969063944 290.0817102291771 L 243.23817325189836 225.5998855090901 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 241.9133655524601 247.6034036223864 L 351.87240460583257 313.6773721627224" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 249.77742792263143 247.6610184719732 L 322.64185139173367 291.4449735288224" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 242.91110388376052 L 322.64185139173367 286.69505894060967" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 238.16118929554784 L 322.64185139173367 281.94514435239705" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="247.0430286972969" cy="239.45009220527868" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="346.40360615516363" cy="299.1554854646185" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="327.8562983630285" cy="288.01047872287506" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="333.1555291607814" cy="291.19476636337316" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="338.4547599585343" cy="294.3790540038713" r="2.2" fill="#3FB950"/>
<path d="M 251.10223562206966 234.2073466174597 L 261.70069721757545 240.57592189845593" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="blade-unit" data-node-id="node-03" tabindex="0" role="button" aria-label="gpu-metal">
<path class="blade-top" d="M 358.5441772348407 153.85716627104063 L 465.8536008893367 218.3389909911276 L 350.5475969063944 260.6322397822585 L 243.23817325189836 196.15041506217153 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 465.8536008893367 241.1385810145484 L 350.5475969063944 283.43182980567934 L 350.5475969063944 260.6322397822585 L 465.8536008893367 218.3389909911276 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 243.23817325189836 218.95000508559235 L 350.5475969063944 283.43182980567934 L 350.5475969063944 260.6322397822585 L 243.23817325189836 196.15041506217153 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 241.9133655524601 218.1539331754678 L 351.87240460583257 284.22790171580385" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 249.77742792263143 218.21154802505464 L 322.64185139173367 261.99550308190385" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 213.46163343684196 L 322.64185139173367 257.2455884936911" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 208.7117188486293 L 322.64185139173367 252.4956739054785" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="247.0430286972969" cy="210.00062175836013" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="346.40360615516363" cy="269.70601501769994" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="327.8562983630285" cy="258.5610082759565" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="333.1555291607814" cy="261.7452959164546" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="338.4547599585343" cy="264.92958355695276" r="2.2" fill="#3FB950"/>
<path d="M 251.10223562206966 204.75787617054115 L 261.70069721757545 211.1264514515374" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="blade-unit" data-node-id="node-04" tabindex="0" role="button" aria-label="k3s-app-wrk-01">
<path class="blade-top" d="M 358.5441772348407 124.40769582412207 L 465.8536008893367 188.88952054420903 L 350.5475969063944 231.18276933533997 L 243.23817325189836 166.70094461525298 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 465.8536008893367 211.68911056762985 L 350.5475969063944 253.9823593587608 L 350.5475969063944 231.18276933533997 L 465.8536008893367 188.88952054420903 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 243.23817325189836 189.5005346386738 L 350.5475969063944 253.9823593587608 L 350.5475969063944 231.18276933533997 L 243.23817325189836 166.70094461525298 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 241.9133655524601 188.70446272854926 L 351.87240460583257 254.7784312688853" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 249.77742792263143 188.76207757813611 L 322.64185139173367 232.54603263498527" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 184.0121629899234 L 322.64185139173367 227.79611804677262" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 179.26224840171074 L 322.64185139173367 223.04620345855992" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="247.0430286972969" cy="180.55115131144157" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="346.40360615516363" cy="240.2565445707814" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="327.8562983630285" cy="229.11153782903796" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="333.1555291607814" cy="232.29582546953606" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="338.4547599585343" cy="235.4801131100342" r="2.2" fill="#3FB950"/>
<path d="M 251.10223562206966 175.3084057236226 L 261.70069721757545 181.67698100461885" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="blade-unit" data-node-id="node-05" tabindex="0" role="button" aria-label="k3s-db-wrk-02">
<path class="blade-top" d="M 358.5441772348407 94.95822537720352 L 465.8536008893367 159.44005009729048 L 350.5475969063944 201.73329888842142 L 243.23817325189836 137.25147416833443 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 465.8536008893367 182.2396401207113 L 350.5475969063944 224.53288891184224 L 350.5475969063944 201.73329888842142 L 465.8536008893367 159.44005009729048 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 243.23817325189836 160.05106419175524 L 350.5475969063944 224.53288891184224 L 350.5475969063944 201.73329888842142 L 243.23817325189836 137.25147416833443 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 241.9133655524601 159.2549922816307 L 351.87240460583257 225.32896082196675" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 249.77742792263143 159.3126071312175 L 322.64185139173367 203.09656218806668" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 154.56269254300486 L 322.64185139173367 198.346647599854" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 149.81277795479218 L 322.64185139173367 193.59673301164136" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="247.0430286972969" cy="151.10168086452302" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="346.40360615516363" cy="210.8070741238628" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="327.8562983630285" cy="199.6620673821194" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="333.1555291607814" cy="202.8463550226175" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="338.4547599585343" cy="206.03064266311563" r="2.2" fill="#3FB950"/>
<path d="M 251.10223562206966 145.85893527670402 L 261.70069721757545 152.2275105577003" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="blade-unit" data-node-id="node-06" tabindex="0" role="button" aria-label="k3s-gitops-wrk-03">
<path class="blade-top" d="M 358.5441772348407 65.50875493028497 L 465.8536008893367 129.99057965037193 L 350.5475969063944 172.28382844150286 L 243.23817325189836 107.80200372141587 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 465.8536008893367 152.79016967379275 L 350.5475969063944 195.08341846492368 L 350.5475969063944 172.28382844150286 L 465.8536008893367 129.99057965037193 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 243.23817325189836 130.60159374483672 L 350.5475969063944 195.08341846492368 L 350.5475969063944 172.28382844150286 L 243.23817325189836 107.80200372141587 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 241.9133655524601 129.80552183471215 L 351.87240460583257 195.87949037504822" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 249.77742792263143 129.86313668429895 L 322.64185139173367 173.64709174114813" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 125.1132220960863 L 322.64185139173367 168.89717715293546" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 249.77742792263143 120.36330750787363 L 322.64185139173367 164.1472625647228" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="247.0430286972969" cy="121.65221041760446" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="346.40360615516363" cy="181.35760367694425" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="327.8562983630285" cy="170.21259693520085" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="333.1555291607814" cy="173.39688457569895" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="338.4547599585343" cy="176.58117221619707" r="2.2" fill="#3FB950"/>
<path d="M 251.10223562206966 116.40946482978546 L 261.70069721757545 122.77804011078175" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="blade-unit" data-node-id="node-07" tabindex="0" role="button" aria-label="gpu-cluster-3">
<path class="blade-top" d="M 544.0172551561918 324.206174582312 L 651.3266788106879 388.68799930239896 L 536.0206748277456 430.98124809352987 L 428.71125117324954 366.49942337344294 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 651.3266788106879 411.4875893258198 L 536.0206748277456 453.7808381169507 L 536.0206748277456 430.98124809352987 L 651.3266788106879 388.68799930239896 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 428.71125117324954 389.29901339686376 L 536.0206748277456 453.7808381169507 L 536.0206748277456 430.98124809352987 L 428.71125117324954 366.49942337344294 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 427.3864434738113 388.5029414867392 L 537.3454825271838 454.57691002707526" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 435.25050584398264 388.56055633632604 L 508.1149293130849 432.3445113931752" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 383.81064174811337 L 508.1149293130849 427.5945968049625" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 379.0607271599007 L 508.1149293130849 422.84468221674985" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="432.5161066186481" cy="380.34963006963153" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="531.8766840765148" cy="440.05502332897134" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="513.3293762843797" cy="428.9100165872279" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="518.6286070821326" cy="432.094304227726" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="523.9278378798855" cy="435.2785918682241" r="2.2" fill="#3FB950"/>
<path d="M 436.57531354342086 375.10688448181253 L 447.1737751389266 381.4754597628088" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="blade-unit" data-node-id="node-08" tabindex="0" role="button" aria-label="pk-desktop">
<path class="blade-top" d="M 544.0172551561918 294.7567041353934 L 651.3266788106879 359.2385288554804 L 536.0206748277456 401.5317776466113 L 428.71125117324954 337.0499529265244 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 651.3266788106879 382.03811887890123 L 536.0206748277456 424.33136767003214 L 536.0206748277456 401.5317776466113 L 651.3266788106879 359.2385288554804 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 428.71125117324954 359.8495429499452 L 536.0206748277456 424.33136767003214 L 536.0206748277456 401.5317776466113 L 428.71125117324954 337.0499529265244 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 427.3864434738113 359.05347103982064 L 537.3454825271838 425.1274395801567" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 435.25050584398264 359.1110858894075 L 508.1149293130849 402.89504094625664" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 354.3611713011948 L 508.1149293130849 398.14512635804397" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 349.61125671298214 L 508.1149293130849 393.3952117698313" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="432.5161066186481" cy="350.900159622713" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="531.8766840765148" cy="410.6055528820528" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="513.3293762843797" cy="399.46054614030936" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="518.6286070821326" cy="402.64483378080746" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="523.9278378798855" cy="405.8291214213056" r="2.2" fill="#E3B341"/>
<path d="M 436.57531354342086 345.657414034894 L 447.1737751389266 352.02598931589023" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="blade-unit" data-node-id="node-09" tabindex="0" role="button" aria-label="pk-tablet-linux">
<path class="blade-top" d="M 544.0172551561918 265.30723368847487 L 651.3266788106879 329.78905840856186 L 536.0206748277456 372.08230719969276 L 428.71125117324954 307.60048247960583 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 651.3266788106879 352.5886484319827 L 536.0206748277456 394.8818972231136 L 536.0206748277456 372.08230719969276 L 651.3266788106879 329.78905840856186 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 428.71125117324954 330.40007250302665 L 536.0206748277456 394.8818972231136 L 536.0206748277456 372.08230719969276 L 428.71125117324954 307.60048247960583 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 427.3864434738113 329.6040005929021 L 537.3454825271838 395.67796913323815" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 435.25050584398264 329.66161544248894 L 508.1149293130849 373.4455704993381" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 324.9117008542762 L 508.1149293130849 368.6956559111254" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 320.1617862660636 L 508.1149293130849 363.94574132291274" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="432.5161066186481" cy="321.4506891757944" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="531.8766840765148" cy="381.15608243513424" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="513.3293762843797" cy="370.0110756933908" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="518.6286070821326" cy="373.1953633338889" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="523.9278378798855" cy="376.379650974387" r="2.2" fill="#3FB950"/>
<path d="M 436.57531354342086 316.2079435879754 L 447.1737751389266 322.5765188689717" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="blade-unit" data-node-id="node-10" tabindex="0" role="button" aria-label="devflow-runner-01">
<path class="blade-top" d="M 544.0172551561918 235.85776324155634 L 651.3266788106879 300.3395879616433 L 536.0206748277456 342.6328367527742 L 428.71125117324954 278.1510120326873 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 651.3266788106879 323.1391779850641 L 536.0206748277456 365.43242677619503 L 536.0206748277456 342.6328367527742 L 651.3266788106879 300.3395879616433 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 428.71125117324954 300.9506020561081 L 536.0206748277456 365.43242677619503 L 536.0206748277456 342.6328367527742 L 428.71125117324954 278.1510120326873 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 427.3864434738113 300.15453014598353 L 537.3454825271838 366.2284986863196" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 435.25050584398264 300.2121449955704 L 508.1149293130849 343.99610005241954" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 295.4622304073577 L 508.1149293130849 339.24618546420686" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 290.71231581914503 L 508.1149293130849 334.4962708759942" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="432.5161066186481" cy="292.00121872887587" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="531.8766840765148" cy="351.7066119882157" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="513.3293762843797" cy="340.56160524647225" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="518.6286070821326" cy="343.74589288697035" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="523.9278378798855" cy="346.93018052746845" r="2.2" fill="#3FB950"/>
<path d="M 436.57531354342086 286.75847314105687 L 447.1737751389266 293.1270484220531" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="blade-unit" data-node-id="node-11" tabindex="0" role="button" aria-label="python-sandbox-02">
<path class="blade-top" d="M 544.0172551561918 206.4082927946378 L 651.3266788106879 270.89011751472475 L 536.0206748277456 313.18336630585566 L 428.71125117324954 248.70154158576872 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 651.3266788106879 293.68970753814557 L 536.0206748277456 335.9829563292765 L 536.0206748277456 313.18336630585566 L 651.3266788106879 270.89011751472475 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 428.71125117324954 271.50113160918954 L 536.0206748277456 335.9829563292765 L 536.0206748277456 313.18336630585566 L 428.71125117324954 248.70154158576872 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 427.3864434738113 270.70505969906503 L 537.3454825271838 336.77902823940104" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 435.25050584398264 270.7626745486518 L 508.1149293130849 314.546629605501" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 266.0127599604391 L 508.1149293130849 309.7967150172883" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 261.2628453722265 L 508.1149293130849 305.04680042907563" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="432.5161066186481" cy="262.5517482819573" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="531.8766840765148" cy="322.25714154129713" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="513.3293762843797" cy="311.1121347995537" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="518.6286070821326" cy="314.2964224400518" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="523.9278378798855" cy="317.4807100805499" r="2.2" fill="#3FB950"/>
<path d="M 436.57531354342086 257.3090026941383 L 447.1737751389266 263.67757797513457" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="blade-unit" data-node-id="node-12" tabindex="0" role="button" aria-label="tailscale-derp-03">
<path class="blade-top" d="M 544.0172551561918 176.95882234771923 L 651.3266788106879 241.4406470678062 L 536.0206748277456 283.7338958589371 L 428.71125117324954 219.25207113885017 Z" fill="#212A37" stroke="#364354" stroke-width="0.7"/>
<path class="blade-side" d="M 651.3266788106879 264.240237091227 L 536.0206748277456 306.5334858823579 L 536.0206748277456 283.7338958589371 L 651.3266788106879 241.4406470678062 Z" fill="#18202C" stroke="#2B3746" stroke-width="0.7"/>
<path class="blade-front" d="M 428.71125117324954 242.051661162271 L 536.0206748277456 306.5334858823579 L 536.0206748277456 283.7338958589371 L 428.71125117324954 219.25207113885017 Z" fill="#141B24" stroke="#2D3A4B" stroke-width="0.8"/>
<path d="M 427.3864434738113 241.25558925214645 L 537.3454825271838 307.3295577924825" stroke="#3B485A" stroke-width="0.8"/>
<path class="blade-slit" d="M 435.25050584398264 241.31320410173322 L 508.1149293130849 285.09715915858243" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 236.56328951352057 L 508.1149293130849 280.34724457036975" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<path class="blade-slit" d="M 435.25050584398264 231.8133749253079 L 508.1149293130849 275.5973299821571" stroke="#0B0E13" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="432.5161066186481" cy="233.10227783503876" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle cx="531.8766840765148" cy="292.8076710943786" r="2" fill="#58677A" stroke="#232C37" stroke-width="0.6"/>
<circle class="led led-power" cx="513.3293762843797" cy="281.66266435263515" r="2.2" fill="#3FB950"/>
<circle class="led led-ts" cx="518.6286070821326" cy="284.84695199313325" r="2.2" fill="#58A6FF"/>
<circle class="led led-load" cx="523.9278378798855" cy="288.03123963363134" r="2.2" fill="#3FB950"/>
<path d="M 436.57531354342086 227.85953224721976 L 447.1737751389266 234.22810752821601" stroke="var(--iso-line-dim)" stroke-width="0.8"/>
</g>
<g class="iso-solid"><path class="iso-fill" d="M391.8 365L391.9 361.9L393.4 358.8L396.1 355.9L400 353.3L404.9 351.1L410.6 349.4L416.9 348.3L423.5 347.7L430.3 347.8L436.9 348.5L443 349.8L448.6 351.6L453.2 353.9L456.8 356.6L459.3 359.5L460.4 362.6L460.4 366.4L460.3 369.6L458.8 372.7L456.1 375.6L452.2 378.2L447.3 380.4L441.6 382.1L435.3 383.2L428.6 383.8L421.9 383.7L415.3 383L409.1 381.7L403.6 379.9L399 377.6L395.3 374.9L392.9 372L391.8 368.8Z"/><path class="iso-shade" data-shade="0" d="M447.3 380.4L441.6 382.1L441.6 378.3L447.3 376.6ZM460.4 366.4L460.3 369.6L460.3 365.8L460.4 362.6ZM460.3 369.6L458.8 372.7L458.8 368.9L460.3 365.8ZM458.8 372.7L456.1 375.6L456.1 371.8L458.8 368.9ZM456.1 375.6L452.2 378.2L452.2 374.4L456.1 371.8ZM452.2 378.2L447.3 380.4L447.3 376.6L452.2 374.4Z"/><path class="iso-shade" data-shade="1" d="M441.6 382.1L435.3 383.2L435.3 379.4L441.6 378.3ZM435.3 383.2L428.6 383.8L428.6 380L435.3 379.4Z"/><path class="iso-shade" data-shade="2" d="M428.6 383.8L421.9 383.7L421.9 379.9L428.6 380ZM421.9 383.7L415.3 383L415.3 379.2L421.9 379.9ZM415.3 383L409.1 381.7L409.1 377.9L415.3 379.2Z"/><path class="iso-shade" data-shade="3" d="M409.1 381.7L403.6 379.9L403.6 376.1L409.1 377.9ZM403.6 379.9L399 377.6L399 373.8L403.6 376.1ZM399 377.6L395.3 374.9L395.3 371.1L399 373.8ZM395.3 374.9L392.9 372L392.9 368.2L395.3 371.1ZM392.9 372L391.8 368.8L391.8 365L392.9 368.2Z"/><path class="iso-top" d="M447.3 376.6L441.6 378.3L435.3 379.4L428.6 380L421.9 379.9L415.3 379.2L409.1 377.9L403.6 376.1L399 373.8L395.3 371.1L392.9 368.2L391.8 365L391.9 361.9L393.4 358.8L396.1 355.9L400 353.3L404.9 351.1L410.6 349.4L416.9 348.3L423.5 347.7L430.3 347.8L436.9 348.5L443 349.8L448.6 351.6L453.2 353.9L456.8 356.6L459.3 359.5L460.4 362.6L460.3 365.8L458.8 368.9L456.1 371.8L452.2 374.4Z"/><path class="iso-line iso-crease" data-tone="faint" d="M460.4 362.6L460.3 365.8L458.8 368.9L456.1 371.8L452.2 374.4L447.3 376.6L441.6 378.3L435.3 379.4L428.6 380L421.9 379.9L415.3 379.2L409.1 377.9L403.6 376.1L399 373.8L395.3 371.1L392.9 368.2L391.8 365"/><path class="iso-line iso-edge" data-tone="lo" d="M391.8 365L391.9 361.9L393.4 358.8L396.1 355.9L400 353.3L404.9 351.1L410.6 349.4L416.9 348.3L423.5 347.7L430.3 347.8L436.9 348.5L443 349.8L448.6 351.6L453.2 353.9L456.8 356.6L459.3 359.5L460.4 362.6M460.4 366.4L460.3 369.6L458.8 372.7L456.1 375.6L452.2 378.2L447.3 380.4L441.6 382.1L435.3 383.2L428.6 383.8L421.9 383.7L415.3 383L409.1 381.7L403.6 379.9L399 377.6L395.3 374.9L392.9 372L391.8 368.8M391.8 365L391.8 368.8M460.4 362.6L460.4 366.4"/></g>
<g class="iso-solid"><path class="iso-fill" d="M396 351.6L396.2 348.8L397.5 346.1L399.9 343.6L403.3 341.3L407.5 339.4L412.5 337.9L418 336.9L423.9 336.4L429.8 336.5L435.5 337.1L440.9 338.2L445.8 339.8L449.8 341.8L453 344.2L455.1 346.8L456.1 349.5L456.1 362.8L456 365.6L454.7 368.3L452.3 370.8L448.9 373.1L444.6 375L439.6 376.5L434.1 377.5L428.3 377.9L422.4 377.9L416.7 377.3L411.3 376.2L406.4 374.6L402.3 372.5L399.2 370.2L397.1 367.6L396 364.9Z"/><path class="iso-shade" data-shade="0" d="M444.6 375L439.6 376.5L439.6 363.2L444.6 361.7ZM456.1 362.8L456 365.6L456 352.3L456.1 349.5ZM456 365.6L454.7 368.3L454.7 355L456 352.3ZM454.7 368.3L452.3 370.8L452.3 357.5L454.7 355ZM452.3 370.8L448.9 373.1L448.9 359.8L452.3 357.5ZM448.9 373.1L444.6 375L444.6 361.7L448.9 359.8Z"/><path class="iso-shade" data-shade="1" d="M439.6 376.5L434.1 377.5L434.1 364.2L439.6 363.2ZM434.1 377.5L428.3 377.9L428.3 364.6L434.1 364.2Z"/><path class="iso-shade" data-shade="2" d="M428.3 377.9L422.4 377.9L422.4 364.6L428.3 364.6ZM422.4 377.9L416.7 377.3L416.7 364L422.4 364.6ZM416.7 377.3L411.3 376.2L411.3 362.9L416.7 364Z"/><path class="iso-shade" data-shade="3" d="M411.3 376.2L406.4 374.6L406.4 361.3L411.3 362.9ZM406.4 374.6L402.3 372.5L402.3 359.3L406.4 361.3ZM402.3 372.5L399.2 370.2L399.2 356.9L402.3 359.3ZM399.2 370.2L397.1 367.6L397.1 354.3L399.2 356.9ZM397.1 367.6L396 364.9L396 351.6L397.1 354.3Z"/><path class="iso-top" d="M444.6 361.7L439.6 363.2L434.1 364.2L428.3 364.6L422.4 364.6L416.7 364L411.3 362.9L406.4 361.3L402.3 359.3L399.2 356.9L397.1 354.3L396 351.6L396.2 348.8L397.5 346.1L399.9 343.6L403.3 341.3L407.5 339.4L412.5 337.9L418 336.9L423.9 336.4L429.8 336.5L435.5 337.1L440.9 338.2L445.8 339.8L449.8 341.8L453 344.2L455.1 346.8L456.1 349.5L456 352.3L454.7 355L452.3 357.5L448.9 359.8Z"/><path class="iso-line iso-crease" data-tone="faint" d="M456.1 349.5L456 352.3L454.7 355L452.3 357.5L448.9 359.8L444.6 361.7L439.6 363.2L434.1 364.2L428.3 364.6L422.4 364.6L416.7 364L411.3 362.9L406.4 361.3L402.3 359.3L399.2 356.9L397.1 354.3L396 351.6"/><path class="iso-line iso-edge" data-tone="mid" d="M396 351.6L396.2 348.8L397.5 346.1L399.9 343.6L403.3 341.3L407.5 339.4L412.5 337.9L418 336.9L423.9 336.4L429.8 336.5L435.5 337.1L440.9 338.2L445.8 339.8L449.8 341.8L453 344.2L455.1 346.8L456.1 349.5M456.1 362.8L456 365.6L454.7 368.3L452.3 370.8L448.9 373.1L444.6 375L439.6 376.5L434.1 377.5L428.3 377.9L422.4 377.9L416.7 377.3L411.3 376.2L406.4 374.6L402.3 372.5L399.2 370.2L397.1 367.6L396 364.9M396 351.6L396 364.9M456.1 349.5L456.1 362.8"/></g>
<g class="iso-solid"><path class="iso-fill" d="M398.2 349.6L398.3 347L399.5 344.5L401.7 342.2L404.9 340.1L408.9 338.3L413.5 336.9L418.6 336L424 335.5L429.5 335.6L434.8 336.2L439.9 337.2L444.3 338.7L448.1 340.6L451.1 342.7L453 345.1L454 347.7L454 349.6L453.9 352.1L452.7 354.7L450.4 357L447.3 359.1L443.3 360.9L438.7 362.3L433.6 363.2L428.2 363.6L422.7 363.6L417.3 363L412.3 362L407.8 360.5L404 358.6L401.1 356.5L399.1 354.1L398.2 351.5Z"/><path class="iso-shade" data-shade="0" d="M443.3 360.9L438.7 362.3L438.7 360.4L443.3 359ZM454 349.6L453.9 352.1L453.9 350.2L454 347.7ZM453.9 352.1L452.7 354.7L452.7 352.8L453.9 350.2ZM452.7 354.7L450.4 357L450.4 355.1L452.7 352.8ZM450.4 357L447.3 359.1L447.3 357.2L450.4 355.1ZM447.3 359.1L443.3 360.9L443.3 359L447.3 357.2Z"/><path class="iso-shade" data-shade="1" d="M438.7 362.3L433.6 363.2L433.6 361.3L438.7 360.4ZM433.6 363.2L428.2 363.6L428.2 361.7L433.6 361.3Z"/><path class="iso-shade" data-shade="2" d="M428.2 363.6L422.7 363.6L422.7 361.7L428.2 361.7ZM422.7 363.6L417.3 363L417.3 361.1L422.7 361.7ZM417.3 363L412.3 362L412.3 360.1L417.3 361.1Z"/><path class="iso-shade" data-shade="3" d="M412.3 362L407.8 360.5L407.8 358.6L412.3 360.1ZM407.8 360.5L404 358.6L404 356.7L407.8 358.6ZM404 358.6L401.1 356.5L401.1 354.6L404 356.7ZM401.1 356.5L399.1 354.1L399.1 352.2L401.1 354.6ZM399.1 354.1L398.2 351.5L398.2 349.6L399.1 352.2Z"/><path class="iso-top" d="M443.3 359L438.7 360.4L433.6 361.3L428.2 361.7L422.7 361.7L417.3 361.1L412.3 360.1L407.8 358.6L404 356.7L401.1 354.6L399.1 352.2L398.2 349.6L398.3 347L399.5 344.5L401.7 342.2L404.9 340.1L408.9 338.3L413.5 336.9L418.6 336L424 335.5L429.5 335.6L434.8 336.2L439.9 337.2L444.3 338.7L448.1 340.6L451.1 342.7L453 345.1L454 347.7L453.9 350.2L452.7 352.8L450.4 355.1L447.3 357.2Z"/><path class="iso-line iso-crease" data-tone="faint" d="M454 347.7L453.9 350.2L452.7 352.8L450.4 355.1L447.3 357.2L443.3 359L438.7 360.4L433.6 361.3L428.2 361.7L422.7 361.7L417.3 361.1L412.3 360.1L407.8 358.6L404 356.7L401.1 354.6L399.1 352.2L398.2 349.6"/><path class="iso-line iso-edge" data-tone="hi" d="M398.2 349.6L398.3 347L399.5 344.5L401.7 342.2L404.9 340.1L408.9 338.3L413.5 336.9L418.6 336L424 335.5L429.5 335.6L434.8 336.2L439.9 337.2L444.3 338.7L448.1 340.6L451.1 342.7L453 345.1L454 347.7M454 349.6L453.9 352.1L452.7 354.7L450.4 357L447.3 359.1L443.3 360.9L438.7 362.3L433.6 363.2L428.2 363.6L422.7 363.6L417.3 363L412.3 362L407.8 360.5L404 358.6L401.1 356.5L399.1 354.1L398.2 351.5M398.2 349.6L398.2 351.5M454 347.7L454 349.6"/></g>
<path class="iso-line" data-tone="lo" d="M440.7 357.3L437.6 358.3L434.2 359L430.6 359.5L426.9 359.7L423.2 359.6L419.6 359.2L416.1 358.6L412.9 357.8L409.9 356.7L407.4 355.4L405.4 353.9L403.8 352.3L402.9 350.7L402.4 348.9L402.6 347.2L403.3 345.5L404.6 343.9L406.5 342.3L408.8 341L411.5 339.8L414.6 338.8L418 338.1L421.6 337.6L425.3 337.4L429 337.5L432.6 337.9L436.1 338.5L439.3 339.3L442.2 340.4L444.7 341.7L446.8 343.2L448.3 344.7L449.3 346.4L449.7 348.2L449.6 349.9L448.8 351.6L447.5 353.2L445.7 354.8L443.4 356.1Z"/>
<path class="iso-line" data-tone="lo" d="M438 355.7L435.5 356.5L432.7 357.1L429.8 357.5L426.8 357.6L423.7 357.6L420.7 357.3L417.9 356.8L415.3 356.1L412.9 355.2L410.8 354.1L409.1 353L407.9 351.7L407.1 350.3L406.7 348.9L406.9 347.4L407.5 346L408.5 344.7L410 343.5L411.9 342.3L414.2 341.4L416.7 340.6L419.5 340L422.4 339.6L425.4 339.5L428.4 339.5L431.4 339.8L434.3 340.3L436.9 341L439.3 341.9L441.3 343L443 344.1L444.3 345.4L445.1 346.8L445.4 348.2L445.3 349.7L444.7 351.1L443.6 352.4L442.1 353.6L440.3 354.7Z"/>
<path class="iso-line" data-tone="lo" d="M446.8 345.8L448.9 345.5M447.4 349.7L449.6 349.8M444.8 353.4L446.7 353.9M431.8 358.2L432.4 359.2M423.5 358.5L423.2 359.5M415.5 357.2L414.4 358.1M405.4 351.2L403.3 351.4M404.7 347.2L402.6 347.1M407.4 343.5L405.5 343M420.3 338.7L419.8 337.7M428.7 338.4L429 337.4M436.7 339.7L437.7 338.8"/>
<path class="iso-line" data-tone="lo" d="M441.3 342.9L444.7 341.6M438 355.6L440.7 357.2M410.8 354.1L407.4 355.3M414.2 341.3L411.5 339.7"/>
<path class="gauge-needle" d="M 426.08646941678165 348.64283024513 L 423.8612564384455 356.77102578509647" stroke="#3FB950" stroke-width="1.8" stroke-linecap="round"/>
<circle cx="426.08646941678165" cy="348.64283024513" r="3" fill="#3FB950"/>
<g class="iso-solid"><path class="iso-fill" d="M405.6 171.4L405.7 170L406.9 168.7L408.9 167.7L411.5 167L414.5 166.8L417.4 167.1L419.9 167.9L421.8 169L422.7 170.3L422.7 185.5L422.6 186.9L421.5 188.2L419.5 189.3L416.8 189.9L413.9 190.1L410.9 189.8L408.4 189.1L406.6 188L405.6 186.6Z"/><path class="iso-shade" data-shade="0" d="M422.7 185.5L422.6 186.9L422.6 171.7L422.7 170.3ZM422.6 186.9L421.5 188.2L421.5 173L422.6 171.7ZM421.5 188.2L419.5 189.3L419.5 174.1L421.5 173Z"/><path class="iso-shade" data-shade="1" d="M419.5 189.3L416.8 189.9L416.8 174.7L419.5 174.1ZM416.8 189.9L413.9 190.1L413.9 174.9L416.8 174.7Z"/><path class="iso-shade" data-shade="2" d="M413.9 190.1L410.9 189.8L410.9 174.6L413.9 174.9Z"/><path class="iso-shade" data-shade="3" d="M410.9 189.8L408.4 189.1L408.4 173.9L410.9 174.6ZM408.4 189.1L406.6 188L406.6 172.8L408.4 173.9ZM406.6 188L405.6 186.6L405.6 171.4L406.6 172.8Z"/><path class="iso-top" d="M419.5 174.1L416.8 174.7L413.9 174.9L410.9 174.6L408.4 173.9L406.6 172.8L405.6 171.4L405.7 170L406.9 168.7L408.9 167.7L411.5 167L414.5 166.8L417.4 167.1L419.9 167.9L421.8 169L422.7 170.3L422.6 171.7L421.5 173Z"/><path class="iso-line iso-crease" data-tone="faint" d="M422.7 170.3L422.6 171.7L421.5 173L419.5 174.1L416.8 174.7L413.9 174.9L410.9 174.6L408.4 173.9L406.6 172.8L405.6 171.4"/><path class="iso-line iso-edge" data-tone="hi" d="M405.6 171.4L405.7 170L406.9 168.7L408.9 167.7L411.5 167L414.5 166.8L417.4 167.1L419.9 167.9L421.8 169L422.7 170.3M422.7 185.5L422.6 186.9L421.5 188.2L419.5 189.3L416.8 189.9L413.9 190.1L410.9 189.8L408.4 189.1L406.6 188L405.6 186.6M405.6 171.4L405.6 186.6M422.7 170.3L422.7 185.5"/></g>
<g class="iso-solid"><path class="iso-fill" d="M471.9 211.2L472 209.8L473.1 208.5L475.1 207.5L477.7 206.8L480.7 206.6L483.6 206.9L486.2 207.7L488 208.8L488.9 210.1L488.9 225.3L488.8 226.7L487.7 228L485.7 229.1L483.1 229.7L480.1 229.9L477.2 229.6L474.6 228.9L472.8 227.8L471.9 226.4Z"/><path class="iso-shade" data-shade="0" d="M488.9 225.3L488.8 226.7L488.8 211.5L488.9 210.1ZM488.8 226.7L487.7 228L487.7 212.8L488.8 211.5ZM487.7 228L485.7 229.1L485.7 213.9L487.7 212.8Z"/><path class="iso-shade" data-shade="1" d="M485.7 229.1L483.1 229.7L483.1 214.5L485.7 213.9ZM483.1 229.7L480.1 229.9L480.1 214.7L483.1 214.5Z"/><path class="iso-shade" data-shade="2" d="M480.1 229.9L477.2 229.6L477.2 214.4L480.1 214.7Z"/><path class="iso-shade" data-shade="3" d="M477.2 229.6L474.6 228.9L474.6 213.7L477.2 214.4ZM474.6 228.9L472.8 227.8L472.8 212.6L474.6 213.7ZM472.8 227.8L471.9 226.4L471.9 211.2L472.8 212.6Z"/><path class="iso-top" d="M485.7 213.9L483.1 214.5L480.1 214.7L477.2 214.4L474.6 213.7L472.8 212.6L471.9 211.2L472 209.8L473.1 208.5L475.1 207.5L477.7 206.8L480.7 206.6L483.6 206.9L486.2 207.7L488 208.8L488.9 210.1L488.8 211.5L487.7 212.8Z"/><path class="iso-line iso-crease" data-tone="faint" d="M488.9 210.1L488.8 211.5L487.7 212.8L485.7 213.9L483.1 214.5L480.1 214.7L477.2 214.4L474.6 213.7L472.8 212.6L471.9 211.2"/><path class="iso-line iso-edge" data-tone="hi" d="M471.9 211.2L472 209.8L473.1 208.5L475.1 207.5L477.7 206.8L480.7 206.6L483.6 206.9L486.2 207.7L488 208.8L488.9 210.1M488.9 225.3L488.8 226.7L487.7 228L485.7 229.1L483.1 229.7L480.1 229.9L477.2 229.6L474.6 228.9L472.8 227.8L471.9 226.4M471.9 211.2L471.9 226.4M488.9 210.1L488.9 225.3"/></g>
<path class="ts-cable-halo" d="M 414.1622335453376 178.46910058256114 Q 421.84727809387937 164.951060157451 480.4026185172487 218.27269608878765" fill="none" stroke="rgba(88,166,255,0.18)" stroke-width="12" stroke-linecap="round"/>
<path class="ts-cable-outer" d="M 414.1622335453376 178.46910058256114 Q 421.84727809387937 164.951060157451 480.4026185172487 218.27269608878765" fill="none" stroke="#121822" stroke-width="6" stroke-linecap="round"/>
<path class="ts-cable-core" d="M 414.1622335453376 178.46910058256114 Q 421.84727809387937 164.951060157451 480.4026185172487 218.27269608878765" fill="none" stroke="#58A6FF" stroke-width="2.2" stroke-dasharray="8 4" stroke-linecap="round">
    <animate attributeName="stroke-dashoffset" values="24;0" dur="1.2s" repeatCount="indefinite"/>
  </path>
</svg>
  </div>

  <!-- Telemetry Readout Dock -->
  <div class="rig-dock">
    <div class="dock-cell">
      <span class="dock-label">TARGET NODE</span>
      <span class="dock-value hi">{selected.name}</span>
    </div>
    <div class="dock-cell">
      <span class="dock-label">SITE / DC</span>
      <span class="dock-value">{selected.site}</span>
    </div>
    <div class="dock-cell">
      <span class="dock-label">TAILSCALE IP</span>
      <span class="dock-value code">{selected.ip} (MagicDNS)</span>
    </div>
    <div class="dock-cell">
      <span class="dock-label">ROLE / WORKLOAD</span>
      <span class="dock-value">{selected.role}</span>
    </div>
    <div class="dock-cell">
      <div class="dock-meter-row">
        <span class="dock-label">LOAD (CPU/RAM)</span>
        <span class="dock-value small">CPU: {selected.cpu}% | RAM: {selected.ram}%</span>
      </div>
      <div class="meter-bar">
        <div class="meter-fill" style="width: {selected.cpu}%"></div>
      </div>
    </div>
    <div class="dock-cell">
      <span class="dock-label">POD CARTRIDGES</span>
      <span class="dock-value">{selected.cartridges.length} Slots (100% Ready)</span>
    </div>
  </div>

  <!-- Physical Pod Cartridge Tray -->
  <div class="cartridge-tray">
    <div class="tray-header">
      <div class="tray-title-group">
        <span class="tray-badge">PHYSICAL MODULAR CASSETTES</span>
        <span class="tray-sub">NODE: {selected.name} · BLADE BAY SLOTS</span>
      </div>
      <div class="tray-status">ALL MODULES SEATED & LOCKED</div>
    </div>
    <div class="cartridge-grid">
      {#each selected.cartridges as c}
        <div class="cartridge-module ready">
          <div class="cartridge-top">
            <div>
              <div class="cartridge-name">{c.name}</div>
              <div class="cartridge-ns">ns: {c.ns}</div>
            </div>
            <div class="cartridge-pull-ring" title="Ejection Pull Ring"></div>
          </div>
          <div class="cartridge-meta">
            <div class="cartridge-res">CPU: {c.cpu}% | {c.ram}</div>
            <div class="pins-gold" title="Zero Restarts (Stable Quad-Pin Contact)">
              <span class="pin"></span>
              <span class="pin"></span>
              <span class="pin"></span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  :global(:root) {
    --bg-dark: #0a0d12;
    --paper: #0e131b;
    --paper-card: #131923;
    --card-border: #1e2634;
    --ink: #e6edf3;
    --ink-faint: #8b949e;
    --accent: #58a6ff;
    --green: #3fb950;
    --amber: #d29922;
  }

  .rig-card {
    background: var(--paper);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 16px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    color: var(--ink);
  }

  .rig-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--card-border);
    padding-bottom: 14px;
  }

  .rig-title-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .rig-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--ink);
  }

  .rig-sub {
    font-size: 10px;
    color: var(--ink-faint);
    letter-spacing: 0.1em;
  }

  .rig-badges {
    display: flex;
    gap: 10px;
  }

  .rig-badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 11px;
  }

  .rig-badge.mesh {
    border-color: rgba(59, 130, 246, 0.3);
    background: rgba(59, 130, 246, 0.08);
  }

  .rig-badge.gitops {
    border-color: rgba(63, 185, 80, 0.3);
    background: rgba(63, 185, 80, 0.08);
  }

  .badge-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .pulse-ts {
    background: #3b82f6;
    box-shadow: 0 0 8px #3b82f6;
  }

  .pulse-git {
    background: var(--green);
    box-shadow: 0 0 8px var(--green);
  }

  .badge-label {
    color: var(--ink-faint);
    font-size: 10px;
    letter-spacing: 0.05em;
  }

  .badge-val {
    color: #fff;
    font-weight: 600;
  }

  /* GitOps Kustomization Register Bar */
  .kustomization-bar {
    background: rgba(14, 20, 30, 0.95);
    border: 1px solid #1f293d;
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .kustomization-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    letter-spacing: 0.08em;
  }

  .k-bar-title {
    color: #93c5fd;
    font-weight: 700;
  }

  .k-bar-rev {
    color: var(--ink-faint);
  }

  .k-tiles {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  .k-tile {
    background: #111722;
    border: 1px solid #243044;
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: border-color 0.15s ease;
  }

  .k-tile:hover {
    border-color: #3b82f6;
  }

  .k-tile-top {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .k-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3fb950;
    box-shadow: 0 0 5px rgba(63, 185, 80, 0.6);
  }

  .k-name {
    font-size: 11px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .k-meta {
    display: flex;
    justify-content: space-between;
    font-size: 9.5px;
    color: #8b949e;
  }

  .k-target {
    color: #60a5fa;
  }

  /* SVG Stage */
  .rig-stage {
    position: relative;
    width: 100%;
    background: radial-gradient(circle at 50% 50%, #151d2a 0%, #0c1017 100%);
    border: 1px solid var(--card-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .rig-stage :global(svg) {
    display: block;
    width: 100%;
    height: auto;
    filter: drop-shadow(0 12px 28px rgba(0, 0, 0, 0.6));
  }

  .rig-stage :global(.blade-unit) {
    cursor: pointer;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .rig-stage :global(.blade-unit:hover) {
    filter: drop-shadow(0 0 10px rgba(88, 166, 255, 0.45));
  }

  .rig-stage :global(.blade-unit.active) {
    filter: drop-shadow(0 0 14px rgba(88, 166, 255, 0.8));
  }

  .rig-stage :global(.blade-unit:focus-visible) {
    outline: none;
    filter: drop-shadow(0 0 14px rgba(88, 166, 255, 1));
  }

  /* Telemetry Dock */
  .rig-dock {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 12px;
    background: var(--paper-card);
    border: 1px solid var(--card-border);
    border-radius: 8px;
    padding: 12px 14px;
  }

  .dock-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-right: 1px solid rgba(255, 255, 255, 0.05);
    padding-right: 10px;
  }

  .dock-cell:last-child {
    border-right: none;
    padding-right: 0;
  }

  .dock-label {
    font-size: 9px;
    color: var(--ink-faint);
    letter-spacing: 0.08em;
  }

  .dock-value {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink);
  }

  .dock-value.hi {
    color: var(--accent);
  }

  .dock-value.code {
    font-size: 11px;
    color: #93c5fd;
  }

  .dock-value.small {
    font-size: 10.5px;
    color: #8b949e;
  }

  .dock-meter-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .meter-bar {
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 2px;
  }

  .meter-fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.3s ease;
  }

  /* Pod Cartridge Tray */
  .cartridge-tray {
    background: rgba(14, 20, 30, 0.95);
    border: 1px solid #1f293d;
    border-radius: 8px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tray-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: 8px;
  }

  .tray-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tray-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #93c5fd;
  }

  .tray-sub {
    font-size: 10px;
    color: var(--ink-faint);
  }

  .tray-status {
    font-size: 9.5px;
    color: #3fb950;
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .cartridge-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }

  .cartridge-module {
    background: #111722;
    border: 1px solid #232d3f;
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    transition: border-color 0.15s ease, transform 0.15s ease;
  }

  .cartridge-module:hover {
    border-color: #38bdf8;
    transform: translateY(-1px);
  }

  .cartridge-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .cartridge-name {
    font-size: 11.5px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .cartridge-ns {
    font-size: 9.5px;
    color: #7dd3fc;
    margin-top: 1px;
  }

  .cartridge-pull-ring {
    width: 14px;
    height: 14px;
    border: 2px solid #64748b;
    border-radius: 50%;
    cursor: pointer;
    transition: border-color 0.15s ease;
  }

  .cartridge-pull-ring:hover {
    border-color: #38bdf8;
  }

  .cartridge-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9.5px;
    color: #8b949e;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    padding-top: 6px;
  }

  .pins-gold {
    display: flex;
    gap: 3px;
  }

  .pin {
    width: 3px;
    height: 7px;
    background: #f59e0b;
    border-radius: 1px;
    box-shadow: 0 0 3px rgba(245, 158, 11, 0.5);
  }

  @media (max-width: 900px) {
    .k-tiles {
      grid-template-columns: repeat(2, 1fr);
    }
    .rig-dock {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
