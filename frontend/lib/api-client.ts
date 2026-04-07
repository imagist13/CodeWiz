/**
 * API Client for Adorable Backend
 * Handles authentication and API calls to Go backend and AI service
 */

/**
 * In Docker / production: use Nginx reverse proxy (same-origin).
 * - API_BASE_URL="" → empty string = same-origin, Nginx routes /auth/* and /api/* to backend
 * - AI_SERVICE_URL="/ai" → Nginx routes /ai/* to ai-service
 *
 * In development: use localhost addresses directly.
 */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL !== undefined && process.env.NEXT_PUBLIC_API_URL !== ""
    ? process.env.NEXT_PUBLIC_API_URL
    : ""; // Empty = same-origin (Nginx proxy in Docker)

const AI_SERVICE_URL =
  process.env.NEXT_PUBLIC_AI_SERVICE_URL !== undefined && process.env.NEXT_PUBLIC_AI_SERVICE_URL !== ""
    ? process.env.NEXT_PUBLIC_AI_SERVICE_URL
    : "/ai"; // Default to /ai (Nginx proxy path)

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  git_url?: string;
  is_public?: boolean;
  source_repo_id?: string;
  vm_id?: string;
  created_at?: string;
  updated_at?: string;
  vm?: {
    vmId: string;
    previewUrl: string;
    devCommandTerminalUrl: string;
    additionalTerminalsUrl: string;
  } | null;
  conversations?: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  }>;
  deployments?: Array<{
    commitSha: string;
    commitMessage: string;
    commitDate: string;
    domain: string;
    url: string;
    deploymentId: string | null;
    state: "idle" | "deploying" | "live" | "failed";
  }>;
  productionDomain?: string | null;
  productionDeploymentId?: string | null;
};

export type Conversation = {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type AuthResponse = {
  token: string;
  user: User;
};

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("adorable_token");
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== "undefined") {
      localStorage.setItem("adorable_token", token);
      // Also set cookie for server-side API routes
      document.cookie = `adorable_token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("adorable_token");
      // Also clear cookie
      document.cookie = "adorable_token=; path=/; max-age=0";
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private unwrap<T>(payload: unknown, fallback: T): T {
    if (
      payload !== null &&
      typeof payload === "object" &&
      "data" in payload &&
      (payload as { data: unknown }).data !== undefined
    ) {
      return (payload as { data: T }).data;
    }
    return fallback;
  }

  private async request<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> || {}),
    };

    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("adorable_token");
    }
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(
        error.message || "Request failed",
        response.status,
        error.code
      );
    }

    const json = await response.json();
    return this.unwrap<T>(json, json as T);
  }

  private async requestRaw(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };

    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("adorable_token");
    }
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    return fetch(url, {
      ...options,
      headers,
    });
  }

  // Auth endpoints
  async register(email: string, password: string, name?: string): Promise<AuthResponse> {
    const payload = await this.request<AuthResponse>(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      body: JSON.stringify({ email, password, ...(name ? { name } : {}) }),
    });
    this.setToken(payload.token);
    return payload;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const payload = await this.request<AuthResponse>(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    // unwrap() 把 {data: {token, user}} 解包为 {token, user}，所以 token 在 payload.token
    this.setToken(payload.token);
    return payload;
  }

  async getMe(): Promise<User> {
    return this.request<User>(`${API_BASE_URL}/auth/me`);
  }

  async logout(): Promise<void> {
    await this.request(`${API_BASE_URL}/auth/logout`, { method: "POST" });
    this.clearToken();
  }

  isAuthenticated(): boolean {
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("adorable_token");
    }
    return !!this.token;
  }

  // User endpoints
  async getUser(): Promise<User> {
    return this.request<User>(`${API_BASE_URL}/api/user`);
  }

  async updateUser(data: { name?: string }): Promise<User> {
    return this.request<User>(`${API_BASE_URL}/api/user`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Project endpoints
  async getProjects(): Promise<Project[]> {
    return this.request<Project[]>(`${API_BASE_URL}/api/projects`);
  }

  async getProject(id: string): Promise<Project> {
    return this.request<Project>(`${API_BASE_URL}/api/projects/${id}`);
  }

  async createProject(data: {
    name: string;
    description?: string;
  }): Promise<Project> {
    return this.request<Project>(`${API_BASE_URL}/api/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProject(
    id: string,
    data: { name?: string; description?: string }
  ): Promise<Project> {
    return this.request<Project>(`${API_BASE_URL}/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: string): Promise<void> {
    await this.request(`${API_BASE_URL}/api/projects/${id}`, {
      method: "DELETE",
    });
  }

  async updateProjectVM(
    id: string,
    data: { source_repo_id: string; vm_id: string }
  ): Promise<Project> {
    return this.request<Project>(`${API_BASE_URL}/api/projects/${id}/vm`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Conversation endpoints
  async getConversations(projectId: string): Promise<Conversation[]> {
    return this.request<Conversation[]>(
      `${API_BASE_URL}/api/repos/${projectId}/conversations`
    );
  }

  async createConversation(
    projectId: string,
    title?: string
  ): Promise<Conversation> {
    return this.request<Conversation>(
      `${API_BASE_URL}/api/repos/${projectId}/conversations`,
      {
        method: "POST",
        body: JSON.stringify({ title }),
      }
    );
  }

  async getConversation(
    projectId: string,
    conversationId: string
  ): Promise<{ id: string; project_id: string; title: string; messages: any[] }> {
    return this.request(`${API_BASE_URL}/api/repos/${projectId}/conversations/${conversationId}`);
  }

  // Chat streaming - uses AI service directly
  async *streamChat(
    messages: any[],
    repoId: string,
    conversationId: string
  ): AsyncGenerator<any, void, unknown> {
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("adorable_token");
    }
    const response = await this.requestRaw(`${AI_SERVICE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        repo_id: repoId,
        conversation_id: conversationId,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Stream failed" }));
      throw new ApiError(error.message, response.status);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;
          try {
            yield JSON.parse(data);
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}

export const apiClient = new ApiClient();
export type { User, ApiError };
