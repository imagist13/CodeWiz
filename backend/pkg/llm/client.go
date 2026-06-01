package llm

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type Client struct {
	providers map[string]*Provider
	defaultProvider string
}

type Provider struct {
	Name        string
	BaseURL     string
	APIKey      string
	Model       string
	MaxTokens   int
	Temperature float64
	client      *http.Client
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Name    string `json:"name,omitempty"`
}

type ChatRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature float64   `json:"temperature"`
	MaxTokens   int       `json:"max_tokens"`
	Stream      bool      `json:"stream"`
}

type ChatResponse struct {
	ID      string   `json:"id"`
	Choices []Choice `json:"choices"`
	Usage   Usage    `json:"usage"`
}

type Choice struct {
	Message      Message `json:"message"`
	FinishReason string  `json:"finish_reason"`
}

type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens     int `json:"total_tokens"`
}

func New() *Client {
	c := &Client{
		providers: make(map[string]*Provider),
	}

	c.providers["openai"] = &Provider{
		Name:        "openai",
		BaseURL:    getEnvOrDefault("OPENAI_BASE_URL", "https://api.openai.com/v1"),
		APIKey:     os.Getenv("OPENAI_API_KEY"),
		Model:      getEnvOrDefault("OPENAI_MODEL", "gpt-4o"),
		MaxTokens: 4096,
		Temperature: 0.7,
		client: &http.Client{Timeout: 60 * time.Second},
	}

	c.providers["anthropic"] = &Provider{
		Name:        "anthropic",
		BaseURL:    getEnvOrDefault("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1"),
		APIKey:     os.Getenv("ANTHROPIC_API_KEY"),
		Model:      getEnvOrDefault("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
		MaxTokens:  8192,
		Temperature: 0.7,
		client: &http.Client{Timeout: 120 * time.Second},
	}

	c.providers["deepseek"] = &Provider{
		Name:        "deepseek",
		BaseURL:    getEnvOrDefault("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
		APIKey:     os.Getenv("DEEPSEEK_API_KEY"),
		Model:      getEnvOrDefault("DEEPSEEK_MODEL", "deepseek-chat"),
		MaxTokens:  4096,
		Temperature: 0.7,
		client: &http.Client{Timeout: 60 * time.Second},
	}

	c.defaultProvider = "openai"
	return c
}

func (c *Client) Chat(ctx context.Context, providerName string, messages []Message) (*ChatResponse, error) {
	if providerName == "" {
		providerName = c.defaultProvider
	}

	provider, ok := c.providers[providerName]
	if !ok {
		return nil, fmt.Errorf("unknown provider: %s", providerName)
	}

	if provider.APIKey == "" {
		return nil, fmt.Errorf("API key not configured for provider: %s", providerName)
	}

	if providerName == "anthropic" {
		return c.chatAnthropic(ctx, provider, messages)
	}

	return c.chatOpenAICompatible(ctx, provider, messages)
}

func (c *Client) chatOpenAICompatible(ctx context.Context, p *Provider, messages []Message) (*ChatResponse, error) {
	reqBody := ChatRequest{
		Model:       p.Model,
		Messages:    messages,
		Temperature: p.Temperature,
		MaxTokens:   p.MaxTokens,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("%s/chat/completions", strings.TrimSuffix(p.BaseURL, "/"))
	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var chatResp ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&chatResp); err != nil {
		return nil, err
	}

	return &chatResp, nil
}

func (c *Client) chatAnthropic(ctx context.Context, p *Provider, messages []Message) (*ChatResponse, error) {
	system := ""
	filteredMessages := []Message{}
	for _, m := range messages {
		if m.Role == "system" {
			system = m.Content
		} else {
			filteredMessages = append(filteredMessages, m)
		}
	}

	type claudeReq struct {
		Model         string    `json:"model"`
		Messages      []Message `json:"messages"`
		System        string    `json:"system,omitempty"`
		MaxTokens     int       `json:"max_tokens"`
		Temperature   float64   `json:"temperature"`
	}

	reqBody := claudeReq{
		Model:       p.Model,
		Messages:    filteredMessages,
		MaxTokens:   p.MaxTokens,
		Temperature: p.Temperature,
	}
	if system != "" {
		reqBody.System = system
	}

	body, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("%s/messages", strings.TrimSuffix(p.BaseURL, "/"))
	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.APIKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	text := ""
	for _, c := range result.Content {
		if c.Type == "text" {
			text = c.Text
			break
		}
	}

	return &ChatResponse{
		Choices: []Choice{{
			Message: Message{Role: "assistant", Content: text},
			FinishReason: "stop",
		}},
		Usage: Usage{
			PromptTokens:     result.Usage.InputTokens,
			CompletionTokens: result.Usage.OutputTokens,
		},
	}, nil
}

func (c *Client) ListProviders() []string {
	names := []string{}
	for name := range c.providers {
		names = append(names, name)
	}
	return names
}

func (c *Client) GetProvider(name string) *Provider {
	if p, ok := c.providers[name]; ok {
		return p
	}
	return c.providers[c.defaultProvider]
}

func (c *Client) CloneRepo(ctx context.Context, repoURL, branch, token string) (string, error) {
	return "", fmt.Errorf("not implemented: use container runtime")
}

type HistoryMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func BuildMessages(systemPrompt string, history []HistoryMessage, newMessage string) []Message {
	msgs := []Message{}
	if systemPrompt != "" {
		msgs = append(msgs, Message{Role: "system", Content: systemPrompt})
	}
	for _, m := range history {
		role := m.Role
		if role == "system" {
			role = "system"
		} else if role == "assistant" {
			role = "assistant"
		} else {
			role = "user"
		}
		msgs = append(msgs, Message{Role: role, Content: m.Content})
	}
	if newMessage != "" {
		msgs = append(msgs, Message{Role: "user", Content: newMessage})
	}
	return msgs
}

// StreamChat streams chat completions from the OpenAI-compatible API.
func (c *Client) StreamChat(ctx context.Context, providerName string, messages []Message) (<-chan string, <-chan error) {
	tokenCh := make(chan string, 100)
	errCh := make(chan error, 1)

	if providerName == "" {
		providerName = c.defaultProvider
	}
	provider, ok := c.providers[providerName]
	if !ok || provider.APIKey == "" {
		errCh <- fmt.Errorf("unknown or unconfigured provider: %s", providerName)
		close(tokenCh)
		return tokenCh, errCh
	}

	go func() {
		defer close(tokenCh)

		if providerName == "anthropic" {
			errCh <- fmt.Errorf("streaming not yet implemented for anthropic")
			return
		}

		reqBody := ChatRequest{
			Model:       provider.Model,
			Messages:    messages,
			Temperature: provider.Temperature,
			MaxTokens:   provider.MaxTokens,
			Stream:      true,
		}

		body, err := json.Marshal(reqBody)
		if err != nil {
			errCh <- err
			return
		}

		url := fmt.Sprintf("%s/chat/completions", strings.TrimSuffix(provider.BaseURL, "/"))
		req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(body)))
		if err != nil {
			errCh <- err
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+provider.APIKey)

		resp, err := provider.client.Do(req)
		if err != nil {
			errCh <- err
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			data, _ := io.ReadAll(resp.Body)
			errCh <- fmt.Errorf("LLM API error %d: %s", resp.StatusCode, string(data))
			return
		}

		reader := bufio.NewReader(resp.Body)
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				if err != io.EOF {
					errCh <- err
				}
				break
			}
			line = strings.TrimSpace(line)
			if line == "" || line == "data: [DONE]" {
				continue
			}
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := line[6:]

			var chunk struct {
				Choices []struct {
					Delta struct {
						Content string `json:"content"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if err := json.Unmarshal([]byte(data), &chunk); err != nil {
				continue
			}
			if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
				tokenCh <- chunk.Choices[0].Delta.Content
			}
		}
	}()

	return tokenCh, errCh
}

func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
