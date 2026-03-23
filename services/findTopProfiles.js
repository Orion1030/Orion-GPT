/**
 * Score all user profiles against a parsed JD.
 * Used by the JD-first resume wizard to suggest the best-fit profile before resume generation.
 *
 * Scoring weights:
 *  - Skill match  (50%): mainStack keywords vs JD skills
 *  - Keyword match (30%): role titles + experience keyphrases vs JD requirement keywords
 *  - Role alignment (20%): profile title vs JD job title word overlap
 * A +15 base is added so that profiles with partial data still show a non-zero score.
 */
const { JobDescriptionModel, ProfileModel } = require('../dbModels');

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[\s,;|\/\-\(\)]+/)
    .map(t => t.replace(/[^a-z0-9#+.]/g, ''))
    .filter(t => t.length > 1);
}

async function findTopProfilesCore(userId, jdId) {
  const jd = await JobDescriptionModel.findOne({ _id: jdId, userId }).lean();
  if (!jd) return { topProfiles: [], error: 'Job description not found' };

  const jdSkills = new Set((jd.skills || []).map(s => String(s).toLowerCase().trim()));
  const jdReqText = (jd.requirements || []).concat(jd.responsibilities || []).join(' ');
  const jdKeywords = new Set(tokenize(jdReqText).filter(w => w.length > 2));
  const jdTitleTokens = new Set(tokenize(jd.title || '').filter(w => w.length > 2));

  const profiles = await ProfileModel.find({ userId }).lean();

  const scored = profiles.map((profile) => {
    // Build token sets from profile data
    const stackTokens = new Set(tokenize(profile.mainStack || ''));
    const titleTokens = new Set(tokenize(profile.title || ''));

    const experienceText = (profile.careerHistory || [])
      .map(e => [e.roleTitle || '', e.companySummary || '', ...(e.keyPoints || [])].join(' '))
      .join(' ');
    const expTokens = new Set(tokenize(experienceText));

    // All profile tokens combined
    const allProfileTokens = new Set([...stackTokens, ...titleTokens, ...expTokens]);

    // Skill match: mainStack + exp tokens vs JD skills
    let skillMatch = 0;
    if (jdSkills.size > 0) {
      let matchCount = 0;
      jdSkills.forEach(skill => {
        const skillTokens = tokenize(skill);
        const matched = skillTokens.length > 0 && skillTokens.every(st =>
          [...allProfileTokens].some(pt => pt.includes(st) || st.includes(pt))
        );
        if (matched) matchCount++;
      });
      skillMatch = (matchCount / jdSkills.size) * 100;
    }

    // Keyword match: experience text vs JD requirement keywords
    let keywordMatch = 0;
    if (jdKeywords.size > 0) {
      const limit = Math.min(jdKeywords.size, 50);
      let matchCount = 0;
      let checked = 0;
      for (const kw of jdKeywords) {
        if (checked >= limit) break;
        if (allProfileTokens.has(kw)) matchCount++;
        checked++;
      }
      keywordMatch = (matchCount / limit) * 100;
    }

    // Role alignment: profile title vs JD title
    let roleAlignment = 0;
    if (jdTitleTokens.size > 0) {
      let overlap = 0;
      jdTitleTokens.forEach(w => { if (titleTokens.has(w)) overlap++; });
      roleAlignment = (overlap / jdTitleTokens.size) * 100;
    }

    const score = Math.min(
      100,
      Math.round(skillMatch * 0.5 + keywordMatch * 0.3 + roleAlignment * 0.2 + 15)
    );

    return {
      profileId: profile._id.toString(),
      profileName: profile.fullName || 'Unnamed',
      profileTitle: profile.title || '',
      score,
      breakdown: {
        skillMatch: Math.round(skillMatch),
        keywordMatch: Math.round(keywordMatch),
        roleAlignment: Math.round(roleAlignment),
      },
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return { topProfiles: scored };
}

module.exports = { findTopProfilesCore };
