/**
 * Adapter between Profile.experiences and Resume.experiences shapes.
 *
 * Profile experience fields:
 *   roleTitle, companyName, startDate, endDate, companySummary, keyPoints[]
 *
 * Resume experience fields:
 *   title, companyName, companyLocation, summary, descriptions[], startDate, endDate
 */

/**
 * Convert a single Profile experience to a Resume experience.
 * @param {object} profileExp
 * @returns {object}
 */
function profileExperienceToResumeExperience(profileExp) {
  return {
    title: profileExp.roleTitle || profileExp.title || "",
    companyName: profileExp.companyName || "",
    companyLocation: profileExp.companyLocation || "",
    summary: profileExp.companySummary || profileExp.summary || "",
    descriptions: Array.isArray(profileExp.keyPoints)
      ? profileExp.keyPoints
      : Array.isArray(profileExp.descriptions)
        ? profileExp.descriptions
        : [],
    startDate: profileExp.startDate || "",
    endDate: profileExp.endDate || "",
  };
}

/**
 * Convert a single Resume experience to a Profile experience.
 * @param {object} resumeExp
 * @returns {object}
 */
function resumeExperienceToProfileExperience(resumeExp) {
  return {
    roleTitle: resumeExp.title || resumeExp.roleTitle || "",
    companyName: resumeExp.companyName || "",
    startDate: resumeExp.startDate || "",
    endDate: resumeExp.endDate || "",
    companySummary: resumeExp.summary || resumeExp.companySummary || "",
    keyPoints: Array.isArray(resumeExp.descriptions)
      ? resumeExp.descriptions
      : Array.isArray(resumeExp.keyPoints)
        ? resumeExp.keyPoints
        : [],
  };
}

module.exports = { profileExperienceToResumeExperience, resumeExperienceToProfileExperience };
