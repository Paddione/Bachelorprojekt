export interface ModelStatus {
  name: string; port: number;
  status: 'running'|'degraded'|'offline';
  vram_gb: number|null; slots_used: number|null;
  slots_total: number|null; model: string|null;
  error?: string;
}

const MODEL_SERVERS = [{ name: 'gemma-4-12b', port: 8091 }];

export async function checkModels(): Promise<ModelStatus[]> {
  return await Promise.all(MODEL_SERVERS.map(async ({name,port}) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(()=>ctrl.abort(),3000);
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return {name,port,status:'degraded' as const,vram_gb:null,slots_used:null,slots_total:null,model:null,error:`HTTP ${res.status}`};
      const body = await res.json();
      return {name,port,status:'running' as const,vram_gb:body.vram_used_gb??body.vram_gb??null,slots_used:body.slots_used??body.slot_used??null,slots_total:body.slots_total??body.slots??null,model:body.model??body.model_name??null};
    } catch(e:any) {
      return {name,port,status:'offline' as const,vram_gb:null,slots_used:null,slots_total:null,model:null,error:e.name==='AbortError'?'Health check timeout (3s)':e.message};
    }
  }));
}
