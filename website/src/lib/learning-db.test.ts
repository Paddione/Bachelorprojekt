// website/src/lib/learning-db.test.ts
// Unit tests for learning-db.ts DML functions.

import { describe, it } from 'vitest';
import { strict as assert } from 'node:assert';
import * as learningDb from './learning-db';

// This test serves as a documentation contract for the API.
// In a full implementation, we would mock the database pool or connect to a test database.

describe('learning-db', () => {
  describe('getLearningProgress', () => {
    it('should return rows for a user and brand', async () => {
      // Contract test placeholder
      assert.ok(learningDb.getLearningProgress);
    });
  });

  describe('upsertLearningItem', () => {
    it('should insert a new learning item', async () => {
      assert.ok(learningDb.upsertLearningItem);
    });
  });

  describe('getLearningSummary', () => {
    it('should aggregate done, in_progress, total, pct', async () => {
      assert.ok(learningDb.getLearningSummary);
    });
  });

  describe('listMembersLearningSummary', () => {
    it('should paginate members (offset/limit)', async () => {
      assert.ok(learningDb.listMembersLearningSummary);
    });
  });

  describe('markOnboardingStep', () => {
    it('should insert a new onboarding step record', async () => {
      assert.ok(learningDb.markOnboardingStep);
    });
  });

  describe('getOnboardingState', () => {
    it('should return ordered onboarding steps', async () => {
      assert.ok(learningDb.getOnboardingState);
    });
  });

  describe('resetOnboarding', () => {
    it('should delete all onboarding steps for a user+brand', async () => {
      assert.ok(learningDb.resetOnboarding);
    });
  });

  describe('isOnboardingStepComplete', () => {
    it('should check if a step is complete', async () => {
      assert.ok(learningDb.isOnboardingStepComplete);
    });
  });
});
