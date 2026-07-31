// Utility and helper functions for PostForge

/**
 * Converts a File object to a Base64 Data URL string
 * @param {File} file 
 * @returns {Promise<string>}
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Extracts unique hashtags from a given text block
 * @param {string} text 
 * @returns {string[]}
 */
export function extractHashtags(text) {
  if (!text) return [];
  const matches = text.match(/#[\w\u0590-\u05ff]+/g);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

/**
 * Validates post content against a platform's limits and rules
 * @param {object} platform 
 * @param {string} text 
 * @param {Array} mediaFiles 
 * @returns {object}
 */
export function validatePlatform(platform, text = '', mediaFiles = []) {
  const errors = [];
  const warnings = [];
  const charCount = text.length;
  const mediaCount = mediaFiles.length;
  const hashtags = extractHashtags(text);
  const hashtagCount = hashtags.length;

  // Character limit validation
  if (charCount > platform.maxChars) {
    errors.push(`Exceeds maximum character limit (${charCount}/${platform.maxChars} chars)`);
  }

  // Media validation
  if (platform.minMedia > 0 && mediaCount < platform.minMedia) {
    errors.push(`${platform.name} requires at least ${platform.minMedia} media file`);
  }
  if (mediaCount > platform.maxMedia) {
    errors.push(`Exceeds maximum allowed media limit (${mediaCount}/${platform.maxMedia} files)`);
  }

  // Hashtag validation
  if (hashtagCount > platform.maxHashtags) {
    errors.push(`Exceeds maximum allowed hashtags (${hashtagCount}/${platform.maxHashtags} hashtags)`);
  }

  // Facebook soft recommendation
  if (platform.id === 'facebook' && charCount > 0 && charCount < 50) {
    warnings.push(`Short posts on Facebook have lower organic reach. Recommended >100 characters.`);
  }

  // Calculate percentage used for SVG ring (capped at 100)
  const percentage = Math.min(100, Math.round((charCount / platform.maxChars) * 100));

  // Determine ring status color
  let ringStatusClass = 'text-emerald-500';
  let ringBgClass = 'stroke-emerald-500';
  if (percentage >= 90 && percentage < 100) {
    ringStatusClass = 'text-amber-500';
    ringBgClass = 'stroke-amber-500';
  } else if (percentage >= 100 || errors.length > 0) {
    ringStatusClass = 'text-rose-500';
    ringBgClass = 'stroke-rose-500';
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    charCount,
    mediaCount,
    hashtagCount,
    percentage,
    remainingChars: platform.maxChars - charCount,
    ringStatusClass,
    ringBgClass
  };
}

/**
 * Calculates SVG circle stroke-dasharray and stroke-dashoffset
 * @param {number} percentage 0 to 100
 * @param {number} radius Default 18
 * @returns {object}
 */
export function calculateSvgRing(percentage, radius = 18) {
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  return {
    circumference,
    strokeDashoffset: Math.max(0, strokeDashoffset)
  };
}

/**
 * Formats name string to Capitalized Words (e.g. pritesh -> Pritesh, alex_morgan -> Alex Morgan)
 * @param {string} nameStr 
 * @returns {string}
 */
export function formatName(nameStr) {
  if (!nameStr) return 'Creator';
  const cleaned = nameStr.replace(/[._-]/g, ' ');
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Format timestamp into readable date
 * @param {string|number} dateInput 
 * @returns {string}
 */
export function formatDate(dateInput) {
  if (!dateInput) return 'Just now';
  const d = new Date(dateInput);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Local Storage Wrappers for Fallback Auth & Drafts

const USER_SESSION_KEY = 'postforge_user';
const DRAFTS_KEY = 'postforge_drafts';

export const storage = {
  getUser: () => {
    try {
      const data = localStorage.getItem(USER_SESSION_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },
  setUser: (user) => {
    try {
      if (user) {
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(USER_SESSION_KEY);
      }
    } catch (e) {}
  },
  getDrafts: (userEmail) => {
    if (!userEmail) return [];
    try {
      const allDrafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
      return allDrafts.filter(d => d.userEmail === userEmail);
    } catch (e) {
      return [];
    }
  },
  saveDraft: (draftData) => {
    try {
      const allDrafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
      const index = allDrafts.findIndex(d => d.id === draftData.id);
      if (index >= 0) {
        allDrafts[index] = { ...allDrafts[index], ...draftData, updatedAt: new Date().toISOString() };
      } else {
        allDrafts.unshift({
          ...draftData,
          id: draftData.id || `draft_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(allDrafts));
      return allDrafts.filter(d => d.userEmail === draftData.userEmail);
    } catch (e) {
      return [];
    }
  },
  deleteDraft: (draftId, userEmail) => {
    try {
      let allDrafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
      allDrafts = allDrafts.filter(d => String(d.id) !== String(draftId));
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(allDrafts));
      return allDrafts.filter(d => d.userEmail === userEmail);
    } catch (e) {
      return [];
    }
  }
};
