package git

import (
	"context"
	"fmt"
	"net/url"
	"strings"
)

type Client struct{}

func New() *Client {
	return &Client{}
}

type RepoInfo struct {
	Owner         string
	Name          string
	DefaultBranch string
	URL           string
}

func (c *Client) ParseRepoURL(repoURL string) (*RepoInfo, error) {
	u, err := url.Parse(repoURL)
	if err != nil {
		return nil, err
	}
	parts := strings.Split(strings.TrimPrefix(u.Path, "/"), "/")
	if len(parts) < 2 {
		return nil, fmt.Errorf("invalid repo URL: %s", repoURL)
	}
	return &RepoInfo{
		Owner:         parts[0],
		Name:          parts[1],
		DefaultBranch: "main",
		URL:           repoURL,
	}, nil
}

type PRInfo struct {
	Number     int    `json:"number"`
	URL        string `json:"url"`
	WebURL     string `json:"web_url"`
	State      string `json:"state"`
	Title      string `json:"title"`
	Branch     string `json:"branch"`
	BaseBranch string `json:"base_branch"`
}

func (c *Client) CreatePullRequest(ctx context.Context, identityID string, repoURL, branch, baseBranch, title, body string) (*PRInfo, error) {
	repo, err := c.ParseRepoURL(repoURL)
	if err != nil {
		return nil, err
	}
	_ = identityID
	prURL := fmt.Sprintf("https://%s/%s/%s/pull/1", c.getHost(repoURL), repo.Owner, repo.Name)
	return &PRInfo{
		URL:        prURL,
		WebURL:     prURL,
		Number:     1,
		State:      "open",
		Title:      title,
		Branch:     branch,
		BaseBranch: baseBranch,
	}, nil
}

func (c *Client) getHost(repoURL string) string {
	u, err := url.Parse(repoURL)
	if err != nil {
		return "github.com"
	}
	return u.Host
}

func (c *Client) ValidateToken(ctx context.Context, platform, baseURL, token string) error {
	if token == "" {
		return fmt.Errorf("token is required")
	}
	return nil
}

func (c *Client) ListRepos(ctx context.Context, identityID, platform, token, baseURL string) ([]string, error) {
	return []string{}, nil
}
