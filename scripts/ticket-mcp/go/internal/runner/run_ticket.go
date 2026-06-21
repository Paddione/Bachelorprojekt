package runner

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const maxBufferSize = 10 * 1024 * 1024

func findRepoRoot() string {
	if env := os.Getenv("TICKET_MCP_REPO_ROOT"); env != "" {
		return env
	}
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		exe = os.Args[0]
	}
	dir := filepath.Dir(exe)
	for {
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			if _, err := os.Stat(filepath.Join(dir, "scripts", "ticket.sh")); err == nil {
				return dir
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

var repoRoot = findRepoRoot()

func ticketShPath() string {
	if env := os.Getenv("TICKET_SH"); env != "" {
		cleaned := filepath.Clean(env)
		root := repoRoot
		if root != "" && strings.HasPrefix(cleaned, root) {
			return cleaned
		}
	}
	return filepath.Join(repoRoot, "scripts", "ticket.sh")
}

func RunTicket(args []string, extraEnv map[string]string) (string, error) {
	ticketSh := ticketShPath()
	cleaned := filepath.Clean(ticketSh)
	if !strings.HasPrefix(cleaned, repoRoot) {
		return "", fmt.Errorf("ticket.sh path %s is outside repo root %s", cleaned, repoRoot)
	}
	cmd := exec.Command("bash", append([]string{ticketSh}, args...)...)
	env := os.Environ()
	for k, v := range extraEnv {
		env = append(env, k+"="+v)
	}
	cmd.Env = env
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			trimmed := strings.TrimSpace(stderr.String())
			if trimmed == "" {
				trimmed = err.Error()
			}
			return "", fmt.Errorf("ticket.sh failed (exit code %d): %s", exitErr.ExitCode(), trimmed)
		}
		return "", fmt.Errorf("ticket.sh failed: %s", err.Error())
	}
	if stdout.Len() > maxBufferSize {
		return stdout.String()[:maxBufferSize], nil
	}
	return stdout.String(), nil
}

func RepoRoot() string {
	return repoRoot
}
