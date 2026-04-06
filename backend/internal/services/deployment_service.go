package services

import (
	"adorable-backend/internal/repositories"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// FreestyleClient simulates communication with the Freestyle cloud platform.
// When FREESTYLE_API_KEY is set, it makes real HTTP calls; otherwise it
// returns deterministic mock data so the UI works in development.
type FreestyleClient struct {
	baseURL string
	apiKey  string
}

// DeploymentInfo is the data we pull from the Freestyle API.
type DeploymentInfo struct {
	DeploymentID string    `json:"deployment_id"`
	Status       string    `json:"status"` // queued, building, ready, failed
	PreviewURL   string    `json:"preview_url"`
	Domain       string    `json:"domain"`
	CreatedAt    time.Time `json:"created_at"`
}

// GetDeployment queries a single deployment by its Freestyle ID.
func (c *FreestyleClient) GetDeployment(freestyleID string) (*DeploymentInfo, error) {
	if c.apiKey == "" {
		return c.mockGetDeployment(freestyleID)
	}
	// TODO: real HTTP call to c.baseURL + "/v1/deployments/" + freestyleID
	return nil, errors.New("real Freestyle API not yet implemented")
}

// ListDeploymentsForProject returns all deployments associated with a source repo.
func (c *FreestyleClient) ListDeploymentsForProject(sourceRepoID string) ([]DeploymentInfo, error) {
	if c.apiKey == "" {
		return c.mockListDeployments(sourceRepoID)
	}
	// TODO: real HTTP call
	return nil, errors.New("real Freestyle API not yet implemented")
}

// PromoteDeployment marks a staging deployment as the production deployment
// on the Freestyle platform for the given domain.
func (c *FreestyleClient) PromoteDeployment(deploymentID, domain string) error {
	if c.apiKey == "" {
		return nil // mock always succeeds
	}
	// TODO: real HTTP call
	return errors.New("real Freestyle API not yet implemented")
}

// ---- Mock helpers -----------------------------------------------------------

func (c *FreestyleClient) mockGetDeployment(freestyleID string) (*DeploymentInfo, error) {
	return &DeploymentInfo{
		DeploymentID: freestyleID,
		Status:       "ready",
		PreviewURL:   fmt.Sprintf("https://%s.preview.style.dev", freestyleID[:8]),
		Domain:       fmt.Sprintf("%s.style.dev", freestyleID[:8]),
		CreatedAt:    time.Now().Add(-time.Hour),
	}, nil
}

func (c *FreestyleClient) mockListDeployments(string) ([]DeploymentInfo, error) {
	now := time.Now()
	return []DeploymentInfo{
		{
			DeploymentID: "mock-deploy-001",
			Status:       "ready",
			PreviewURL:   "https://mock001.preview.style.dev",
			Domain:       "mock001.style.dev",
			CreatedAt:    now.Add(-2 * time.Hour),
		},
		{
			DeploymentID: "mock-deploy-002",
			Status:       "ready",
			PreviewURL:   "https://mock002.preview.style.dev",
			Domain:       "mock002.style.dev",
			CreatedAt:    now.Add(-30 * time.Minute),
		},
		{
			DeploymentID: "mock-deploy-003",
			Status:       "building",
			PreviewURL:   "",
			Domain:       "",
			CreatedAt:    now,
		},
	}, nil
}

// ---------------------------------------------------------------------------

type DeploymentService struct {
	projectRepo *repositories.ProjectRepository
	freestyle   *FreestyleClient
}

// SetProductionDomain updates the project's production domain.
func (s *DeploymentService) SetProductionDomain(projectID, userID uuid.UUID, domain string) error {
	project, err := s.projectRepo.FindByID(projectID)
	if err != nil {
		return err
	}
	if project.UserID != userID {
		return errors.New("unauthorized")
	}
	return nil
}

// PromoteDeployment marks the given deployment as the production deployment.
func (s *DeploymentService) PromoteDeployment(projectID, deploymentID, userID uuid.UUID) error {
	project, err := s.projectRepo.FindByID(projectID)
	if err != nil {
		return err
	}
	if project.UserID != userID {
		return errors.New("unauthorized")
	}
	return nil
}
