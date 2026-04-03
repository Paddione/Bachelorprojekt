// Outline API helper.
// Creates collections, documents, and manages the customer knowledge base.
// Uses the Outline REST API: https://www.getoutline.com/developers

const OUTLINE_URL = import.meta.env.OUTLINE_URL || 'http://outline.workspace.svc.cluster.local';
const OUTLINE_API_KEY = import.meta.env.OUTLINE_API_KEY || '';

async function outlineApi(endpoint: string, body?: unknown): Promise<Response> {
  return fetch(`${OUTLINE_URL}/api${endpoint}`, {
    method: 'POST', // Outline API uses POST for everything
    headers: {
      Authorization: `Bearer ${OUTLINE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export interface OutlineCollection {
  id: string;
  name: string;
  url: string;
}

export interface OutlineDocument {
  id: string;
  title: string;
  url: string;
  collectionId: string;
}

// Get or create a collection for a customer
export async function getOrCreateCollection(name: string, description?: string): Promise<OutlineCollection | null> {
  if (!OUTLINE_API_KEY) {
    console.log('[outline] No API key configured. Would create collection:', name);
    return null;
  }

  // Search for existing collection
  const listRes = await outlineApi('/collections.list', { limit: 100 });
  if (listRes.ok) {
    const data = await listRes.json();
    const existing = data.data?.find((c: { name: string }) => c.name === name);
    if (existing) {
      return { id: existing.id, name: existing.name, url: `${OUTLINE_URL}${existing.url}` };
    }
  }

  // Create new collection
  const createRes = await outlineApi('/collections.create', {
    name,
    description: description || `Kundenakte: ${name}`,
    permission: 'read_write',
  });

  if (createRes.ok) {
    const data = await createRes.json();
    const col = data.data;
    return { id: col.id, name: col.name, url: `${OUTLINE_URL}${col.url}` };
  }

  console.error('[outline] Failed to create collection:', createRes.status);
  return null;
}

// Create a document in a collection
export async function createDocument(params: {
  title: string;
  text: string;
  collectionId: string;
  parentDocumentId?: string;
  publish?: boolean;
}): Promise<OutlineDocument | null> {
  if (!OUTLINE_API_KEY) {
    console.log('[outline] No API key configured. Would create document:', params.title);
    return null;
  }

  const res = await outlineApi('/documents.create', {
    title: params.title,
    text: params.text,
    collectionId: params.collectionId,
    parentDocumentId: params.parentDocumentId,
    publish: params.publish !== false,
  });

  if (res.ok) {
    const data = await res.json();
    const doc = data.data;
    return { id: doc.id, title: doc.title, url: `${OUTLINE_URL}${doc.url}`, collectionId: doc.collectionId };
  }

  console.error('[outline] Failed to create document:', res.status);
  return null;
}

// Update an existing document
export async function updateDocument(documentId: string, text: string, append?: boolean): Promise<boolean> {
  if (!OUTLINE_API_KEY) return false;

  const res = await outlineApi('/documents.update', {
    id: documentId,
    text,
    append: append || false,
  });

  return res.ok;
}

// Search for documents
export async function searchDocuments(query: string, collectionId?: string): Promise<OutlineDocument[]> {
  if (!OUTLINE_API_KEY) return [];

  const res = await outlineApi('/documents.search', {
    query,
    ...(collectionId ? { collectionId } : {}),
  });

  if (res.ok) {
    const data = await res.json();
    return (data.data || []).map((r: { document: { id: string; title: string; url: string; collectionId: string } }) => ({
      id: r.document.id,
      title: r.document.title,
      url: `${OUTLINE_URL}${r.document.url}`,
      collectionId: r.document.collectionId,
    }));
  }

  return [];
}
