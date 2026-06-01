package tool

import (
	"context"
)

type Tool interface {
	Name() string
	Description() string
	Execute(ctx context.Context, args map[string]interface{}, repoID string) (map[string]interface{}, error)
}

type Executor struct {
	tools map[string]Tool
}

func NewExecutor() *Executor {
	e := &Executor{tools: make(map[string]Tool)}
	e.registerAll()
	return e
}

func (e *Executor) registerAll() {
	// Register all tools
	e.Register(&BashTool{})
	e.Register(&ReadFileTool{})
	e.Register(&WriteFileTool{})
	e.Register(&ListFilesTool{})
	e.Register(&SearchFilesTool{})
	e.Register(&ReplaceInFileTool{})
	e.Register(&AppendToFileTool{})
	e.Register(&MakeDirectoryTool{})
	e.Register(&MovePathTool{})
	e.Register(&DeletePathTool{})
	e.Register(&CommitTool{})
	e.Register(&CheckAppTool{})
	e.Register(&DevServerLogsTool{})
	e.Register(&DeploymentStatusTool{})
}

func (e *Executor) Register(t Tool) {
	e.tools[t.Name()] = t
}

func (e *Executor) Get(name string) (Tool, bool) {
	t, ok := e.tools[name]
	return t, ok
}

func (e *Executor) ListTools() []map[string]string {
	var result []map[string]string
	for _, t := range e.tools {
		result = append(result, map[string]string{
			"name":        t.Name(),
			"description": t.Description(),
		})
	}
	return result
}
