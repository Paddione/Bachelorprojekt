package runner

import (
	"context"
	"sync"
)

// JobStatus represents the lifecycle state of an async job.
type JobStatus string

const (
	JobRunning   JobStatus = "running"
	JobDone      JobStatus = "done"
	JobCancelled JobStatus = "cancelled"
)

// jobEntry holds the mutable state for one async job.
// All fields are protected by JobRegistry.mu.
type jobEntry struct {
	cancel context.CancelFunc
	status JobStatus
	result *Result // nil until Complete is called
}

// JobRegistry is a thread-safe store of async jobs. The zero value is ready to use.
type JobRegistry struct {
	mu   sync.Mutex
	jobs map[string]*jobEntry
}

// GlobalRegistry is the process-wide singleton registry.
var GlobalRegistry JobRegistry

func (r *JobRegistry) ensureInit() {
	if r.jobs == nil {
		r.jobs = make(map[string]*jobEntry)
	}
}

// Register creates a new entry in the registry with status=running.
// Panics if jobID is already registered (jobIDs must be unique per session).
func (r *JobRegistry) Register(jobID string, cancel context.CancelFunc) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ensureInit()
	r.jobs[jobID] = &jobEntry{cancel: cancel, status: JobRunning}
}

// Cancel attempts to cancel a running job.
// Returns (found=false, _) if jobID is unknown.
// Returns (found=true, wasCancelled=false) if the job has already finished or been cancelled.
// Returns (found=true, wasCancelled=true) and calls the cancel func if job is still running.
func (r *JobRegistry) Cancel(jobID string) (found bool, wasCancelled bool) {
	r.mu.Lock()
	entry, ok := r.jobs[jobID]
	if !ok {
		r.mu.Unlock()
		return false, false
	}
	if entry.status != JobRunning {
		r.mu.Unlock()
		return true, false
	}
	entry.status = JobCancelled
	cancel := entry.cancel
	r.mu.Unlock()
	cancel() // call outside lock; CancelFunc is safe to call concurrently
	return true, true
}

// Complete marks the job as done and stores the result.
// Safe to call from any goroutine; idempotent if called twice.
func (r *JobRegistry) Complete(jobID string, result Result) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry, ok := r.jobs[jobID]
	if !ok {
		return
	}
	// Only transition from running → done; do not overwrite a cancel.
	if entry.status == JobRunning {
		entry.status = JobDone
	}
	if entry.result == nil {
		entry.result = &result
	}
}

// Lookup returns a snapshot of the job's status and, once complete, the result.
// Returns found=false if the jobID is unknown.
func (r *JobRegistry) Lookup(jobID string) (found bool, status JobStatus, result *Result) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry, ok := r.jobs[jobID]
	if !ok {
		return false, "", nil
	}
	return true, entry.status, entry.result
}
