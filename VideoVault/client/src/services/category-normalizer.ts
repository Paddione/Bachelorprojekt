import type { VideoCategories, CustomCategories } from '@/types/video';

export class CategoryNormalizer {
	static normalizeValue(value: string): string {
		return value.trim().toLowerCase();
	}

	static normalizeArray(values: string[]): string[] {
		const seen = new Set<string>();
		const result: string[] = [];
		for (const v of values || []) {
			const n = this.normalizeValue(v);
			if (!n) continue;
			if (!seen.has(n)) {
				seen.add(n);
				result.push(n);
			}
		}
		return result;
	}

	static normalizeStandardCategories(categories: VideoCategories): VideoCategories {
		return {
			age: this.normalizeArray(categories.age || []),
			physical: this.normalizeArray(categories.physical || []),
			ethnicity: this.normalizeArray(categories.ethnicity || []),
			relationship: this.normalizeArray(categories.relationship || []),
			acts: this.normalizeArray(categories.acts || []),
			setting: this.normalizeArray(categories.setting || []),
			quality: this.normalizeArray(categories.quality || []),
			performer: this.normalizeArray(categories.performer || []),
		};
	}

	static normalizeCustomCategories(custom: CustomCategories): CustomCategories {
		const merged: CustomCategories = {};
		Object.entries(custom || {}).forEach(([type, values]) => {
			const normType = this.normalizeValue(type);
			if (!merged[normType]) merged[normType] = [];
			merged[normType] = this.normalizeArray([...(merged[normType] || []), ...(values || [])]);
		});
		// Drop empty arrays
		Object.keys(merged).forEach((k) => {
			if ((merged[k] || []).length === 0) delete merged[k];
		});
		return merged;
	}

	static isDuplicateIgnoreCase(existing: string[], candidate: string): boolean {
		const cand = this.normalizeValue(candidate);
		return (existing || []).some((v) => this.normalizeValue(v) === cand);
	}
}
