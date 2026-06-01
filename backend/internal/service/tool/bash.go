package tool

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

type BashTool struct{}

func (t *BashTool) Name() string        { return "Bash" }
func (t *BashTool) Description() string { return "Execute a bash command in the project workspace" }

func (t *BashTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	command, _ := args["command"].(string)
	if command == "" {
		return nil, fmt.Errorf("missing required argument: command")
	}

	workspace := getWorkspacePath(repoID)
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	if workspace != "" {
		cmd.Dir = workspace
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	return map[string]interface{}{
		"stdout": stdout.String(),
		"stderr": stderr.String(),
		"ok":     err == nil,
	}, nil
}

type ReadFileTool struct{}

func (t *ReadFileTool) Name() string        { return "ReadFile" }
func (t *ReadFileTool) Description() string { return "Read the contents of a file" }

func (t *ReadFileTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	file, _ := args["file"].(string)
	if file == "" {
		return nil, fmt.Errorf("missing required argument: file")
	}

	fullPath := resolvePath(repoID, file)
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return map[string]interface{}{
			"content": "",
			"error":   err.Error(),
			"ok":      false,
		}, nil
	}
	return map[string]interface{}{
		"content": string(data),
		"ok":      true,
	}, nil
}

type WriteFileTool struct{}

func (t *WriteFileTool) Name() string        { return "WriteFile" }
func (t *WriteFileTool) Description() string { return "Write content to a file, creating it if it does not exist" }

func (t *WriteFileTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	file, _ := args["file"].(string)
	content, _ := args["content"].(string)
	if file == "" {
		return nil, fmt.Errorf("missing required argument: file")
	}

	fullPath := resolvePath(repoID, file)
	if err := os.MkdirAll(getDir(fullPath), 0755); err != nil {
		return nil, err
	}
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok":    true,
		"path":  fullPath,
	}, nil
}

type ListFilesTool struct{}

func (t *ListFilesTool) Name() string        { return "ListFiles" }
func (t *ListFilesTool) Description() string { return "List files in a directory" }

func (t *ListFilesTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	path, _ := args["path"].(string)
	if path == "" {
		path = "."
	}

	fullPath := resolvePath(repoID, path)
	cmd := exec.CommandContext(ctx, "find", fullPath, "-maxdepth", "1", "-not", "-name", ".*")
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	cmd.Run()

	return map[string]interface{}{
		"stdout": out.String(),
		"ok":     true,
	}, nil
}

type SearchFilesTool struct{}

func (t *SearchFilesTool) Name() string        { return "SearchFiles" }
func (t *SearchFilesTool) Description() string { return "Search for text within files" }

func (t *SearchFilesTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	query, _ := args["query"].(string)
	path, _ := args["path"].(string)
	if query == "" {
		return nil, fmt.Errorf("missing required argument: query")
	}
	if path == "" {
		path = "."
	}

	fullPath := resolvePath(repoID, path)
	cmd := exec.CommandContext(ctx, "grep", "-rn", query, fullPath)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	cmd.Run()

	return map[string]interface{}{
		"stdout": out.String(),
		"ok":     true,
	}, nil
}

type ReplaceInFileTool struct{}

func (t *ReplaceInFileTool) Name() string        { return "ReplaceInFile" }
func (t *ReplaceInFileTool) Description() string { return "Replace text in a file" }

func (t *ReplaceInFileTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	file, _ := args["file"].(string)
	newText, _ := args["new_text"].(string)
	oldText, _ := args["old_text"].(string)
	if file == "" || oldText == "" {
		return nil, fmt.Errorf("missing required arguments: file, old_text")
	}

	fullPath := resolvePath(repoID, file)
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, err
	}

	content := strings.ReplaceAll(string(data), oldText, newText)
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok": true,
	}, nil
}

type AppendToFileTool struct{}

func (t *AppendToFileTool) Name() string        { return "AppendToFile" }
func (t *AppendToFileTool) Description() string { return "Append content to a file" }

func (t *AppendToFileTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	file, _ := args["file"].(string)
	content, _ := args["content"].(string)
	if file == "" {
		return nil, fmt.Errorf("missing required argument: file")
	}

	fullPath := resolvePath(repoID, file)
	f, err := os.OpenFile(fullPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	if _, err := f.WriteString(content); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok": true,
	}, nil
}

type MakeDirectoryTool struct{}

func (t *MakeDirectoryTool) Name() string        { return "MakeDirectory" }
func (t *MakeDirectoryTool) Description() string { return "Create a directory" }

func (t *MakeDirectoryTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	path, _ := args["path"].(string)
	if path == "" {
		return nil, fmt.Errorf("missing required argument: path")
	}

	fullPath := resolvePath(repoID, path)
	if err := os.MkdirAll(fullPath, 0755); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok": true,
	}, nil
}

type MovePathTool struct{}

func (t *MovePathTool) Name() string        { return "MovePath" }
func (t *MovePathTool) Description() string { return "Move or rename a file or directory" }

func (t *MovePathTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	from, _ := args["from"].(string)
	to, _ := args["to"].(string)
	if from == "" || to == "" {
		return nil, fmt.Errorf("missing required arguments: from, to")
	}

	src := resolvePath(repoID, from)
	dst := resolvePath(repoID, to)
	if err := os.MkdirAll(getDir(dst), 0755); err != nil {
		return nil, err
	}
	if err := os.Rename(src, dst); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok": true,
	}, nil
}

type DeletePathTool struct{}

func (t *DeletePathTool) Name() string        { return "DeletePath" }
func (t *DeletePathTool) Description() string { return "Delete a file or directory" }

func (t *DeletePathTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	path, _ := args["path"].(string)
	if path == "" {
		return nil, fmt.Errorf("missing required argument: path")
	}

	fullPath := resolvePath(repoID, path)
	if err := os.RemoveAll(fullPath); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"ok": true,
	}, nil
}

type CommitTool struct{}

func (t *CommitTool) Name() string        { return "Commit" }
func (t *CommitTool) Description() string { return "Create a git commit with the given message" }

func (t *CommitTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	message, _ := args["message"].(string)
	if message == "" {
		return nil, fmt.Errorf("missing required argument: message")
	}

	workspace := getWorkspacePath(repoID)
	cmd := exec.CommandContext(ctx, "git", "add", "-A")
	cmd.Dir = workspace
	cmd.Run()

	cmd = exec.CommandContext(ctx, "git", "commit", "-m", message)
	cmd.Dir = workspace
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err := cmd.Run()
	return map[string]interface{}{
		"stdout": out.String(),
		"ok":     err == nil,
	}, nil
}

type CheckAppTool struct{}

func (t *CheckAppTool) Name() string        { return "CheckApp" }
func (t *CheckAppTool) Description() string { return "Check if the application is running and responding" }

func (t *CheckAppTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	path, _ := args["path"].(string)
	previewURL := getPreviewURL(repoID)
	if previewURL == "" {
		return map[string]interface{}{
			"ok":         false,
			"statusCode": 0,
			"error":      "preview URL not configured for this project",
		}, nil
	}

	url := previewURL + path
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "CodeWiz-CheckApp/1.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return map[string]interface{}{
			"ok":         false,
			"statusCode": 0,
			"error":      err.Error(),
		}, nil
	}
	defer resp.Body.Close()

	return map[string]interface{}{
		"ok":         resp.StatusCode >= 200 && resp.StatusCode < 400,
		"statusCode": resp.StatusCode,
		"url":        url,
	}, nil
}

type DevServerLogsTool struct{}

func (t *DevServerLogsTool) Name() string        { return "DevServerLogs" }
func (t *DevServerLogsTool) Description() string { return "Fetch development server logs" }

func (t *DevServerLogsTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	maxLines, _ := args["maxLines"].(float64)
	previewURL := getPreviewURL(repoID)
	if previewURL == "" {
		return map[string]interface{}{
			"logs": "",
			"ok":   false,
			"error": "preview URL not configured for this project",
		}, nil
	}

	// Attempt to fetch logs endpoint
	logsURL := previewURL + "/__codewiz_logs"
	if maxLines > 0 {
		logsURL = fmt.Sprintf("%s/__codewiz_logs?maxLines=%.0f", previewURL, maxLines)
	}

	req, err := http.NewRequestWithContext(ctx, "GET", logsURL, nil)
	if err != nil {
		return map[string]interface{}{
			"logs": "",
			"ok":   false,
			"error": "log endpoint not available",
		}, nil
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return map[string]interface{}{
			"logs": "",
			"ok":   false,
			"error": "log endpoint not available",
		}, nil
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	return map[string]interface{}{
		"logs": string(data),
		"ok":   resp.StatusCode == 200,
	}, nil
}

type DeploymentStatusTool struct{}

func (t *DeploymentStatusTool) Name() string        { return "DeploymentStatus" }
func (t *DeploymentStatusTool) Description() string { return "Get the current deployment status" }

func (t *DeploymentStatusTool) Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error) {
	path, _ := args["path"].(string)
	previewURL := getPreviewURL(repoID)
	if previewURL == "" {
		return map[string]interface{}{
			"state":  "idle",
			"url":    "",
			"ok":     false,
			"error":  "preview URL not configured",
		}, nil
	}

	url := previewURL + path
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return map[string]interface{}{
			"state":  "idle",
			"url":    url,
			"ok":     false,
			"isLive": false,
		}, nil
	}
	defer resp.Body.Close()

	isLive := resp.StatusCode >= 200 && resp.StatusCode < 400
	state := "live"
	if !isLive {
		state = "failed"
	}

	return map[string]interface{}{
		"state":     state,
		"url":       url,
		"statusCode": resp.StatusCode,
		"ok":        true,
		"isLive":    isLive,
	}, nil
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

func resolvePath(repoID, file string) string {
	workspace := getWorkspacePath(repoID)
	if workspace == "" {
		return file
	}
	return workspace + "/" + file
}

func getWorkspacePath(repoID string) string {
	return "" // Overridden when repo has a VM/workspace attached
}

func getPreviewURL(repoID string) string {
	return "" // Looked up from project VM info
}

func getDir(path string) string {
	i := strings.LastIndex(path, "/")
	if i < 0 {
		i = strings.LastIndex(path, "\\")
	}
	if i < 0 {
		return "."
	}
	return path[:i]
}
