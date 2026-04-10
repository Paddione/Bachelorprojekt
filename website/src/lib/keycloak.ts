// Keycloak Admin API helper
// Uses the admin-cli client in the master realm to manage users in the workspace realm.

const KC_URL = process.env.KEYCLOAK_URL || 'http://keycloak.workspace.svc.cluster.local:8080';
const KC_REALM = process.env.KEYCLOAK_REALM || 'workspace';
const KC_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER || 'admin';
const KC_ADMIN_PASS = process.env.KEYCLOAK_ADMIN_PASSWORD || 'devadmin';

async function getAdminToken(): Promise<string> {
  const res = await fetch(`${KC_URL}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: KC_ADMIN_USER,
      password: KC_ADMIN_PASS,
    }),
  });

  if (!res.ok) {
    throw new Error(`Keycloak token request failed: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function kcApi(method: string, path: string, body?: unknown): Promise<Response> {
  const token = await getAdminToken();
  const res = await fetch(`${KC_URL}/admin/realms/${KC_REALM}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export interface CreateUserParams {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  company?: string;
}

export async function createUser(params: CreateUserParams): Promise<{ success: boolean; userId?: string; error?: string }> {
  // Check if user with this email already exists
  const existing = await kcApi('GET', `/users?email=${encodeURIComponent(params.email)}&exact=true`);
  if (existing.ok) {
    const users = await existing.json();
    if (users.length > 0) {
      return { success: false, error: 'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.' };
    }
  }

  const username = params.email.toLowerCase();

  const res = await kcApi('POST', '/users', {
    username,
    email: params.email,
    firstName: params.firstName,
    lastName: params.lastName,
    enabled: true,
    emailVerified: false,
    attributes: {
      ...(params.phone ? { phone: [params.phone] } : {}),
      ...(params.company ? { company: [params.company] } : {}),
    },
    requiredActions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
  });

  if (res.status === 201) {
    // Extract user ID from Location header
    const location = res.headers.get('Location') || '';
    const userId = location.split('/').pop() || '';
    return { success: true, userId };
  }

  const errorBody = await res.text();
  console.error('Keycloak create user failed:', res.status, errorBody);
  return { success: false, error: `Keycloak-Fehler: ${res.status}` };
}

export async function sendPasswordResetEmail(userId: string): Promise<boolean> {
  const res = await kcApi('PUT', `/users/${userId}/execute-actions-email`, ['UPDATE_PASSWORD']);
  return res.ok;
}

export interface KcUser {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
}

export async function listUsers(): Promise<KcUser[]> {
  const res = await kcApi('GET', '/users?max=200');
  if (!res.ok) throw new Error(`Failed to list Keycloak users: ${res.status}`);
  return res.json() as Promise<KcUser[]>;
}

export async function getUserById(userId: string): Promise<KcUser | null> {
  const res = await kcApi('GET', `/users/${encodeURIComponent(userId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get Keycloak user ${userId}: ${res.status}`);
  return res.json() as Promise<KcUser>;
}
