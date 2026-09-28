// small helper that calls the Gemini API to compare a resume against a job
// description. Kept as a plain function (not a class/service) since it's
// only ever called from one place right now.
import { env } from "../config/env";

export interface MatchAnalysis {
  matchedSkills: string[];
  missingSkills: string[];
  matchScore: number;
  suggestions: string[];
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;

function buildPrompt(resumeText: string, jobDescription: string) {
  return `You are helping a job seeker see how well their resume matches a job description.

Compare the RESUME below against the JOB DESCRIPTION below and respond with ONLY a JSON object
(no markdown, no code fences) in exactly this shape:

{
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill3", "skill4"],
  "matchScore": 72,
  "suggestions": ["suggestion 1", "suggestion 2"]
}

- matchedSkills: skills/technologies from the job description that the resume already shows
- missingSkills: skills/technologies the job description asks for that the resume doesn't show
- matchScore: a number from 0 to 100 for how well the resume matches this job
- suggestions: 2 short, specific suggestions for improving the resume for this job

RESUME:
"""
${resumeText}
"""

JOB DESCRIPTION:
"""
${jobDescription}
"""`;
}

// returns null if anything goes wrong (no api key, request fails, response
// isn't valid JSON) - per the brief, we just skip the analysis rather than
// retrying or surfacing a hard error to the user
export async function analyzeResumeMatch(
  resumeText: string,
  jobDescription: string
): Promise<MatchAnalysis | null> {
  if (!env.GEMINI_API_KEY) {
    console.log("No GEMINI_API_KEY set, skipping resume analysis");
    return null;
  }

  try {
    // don't let a slow/hanging Gemini call block the request forever
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(resumeText, jobDescription) }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error("Gemini API returned an error:", response.status, await response.text());
      return null;
    }

    const data: any = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error("Gemini response had no text in it:", JSON.stringify(data));
      return null;
    }

    const parsed = JSON.parse(text);

    return {
      matchedSkills: parsed.matchedSkills || [],
      missingSkills: parsed.missingSkills || [],
      matchScore: typeof parsed.matchScore === "number" ? parsed.matchScore : 0,
      suggestions: parsed.suggestions || [],
    };
  } catch (err) {
    console.error("Resume analysis failed:", err);
    return null;
  }
}
