import type { AnalysisResult as AnalysisResultType } from "../types";

export default function AnalysisResult({ analysis }: { analysis: AnalysisResultType }) {
  return (
    <div className="bg-white rounded-2xl border border-teal-100 shadow-sm p-6 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">AI Resume Match</h2>
        {analysis.matchScore !== null && (
          <div className="w-16 h-16 rounded-full border-4 border-teal-700 flex items-center justify-center">
            <span className="text-lg font-bold text-teal-800">{analysis.matchScore}</span>
          </div>
        )}
      </div>

      {analysis.matchedSkills.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-1">Matched skills</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.matchedSkills.map((skill) => (
              <span key={skill} className="text-xs bg-green-100 text-green-700 px-2.5 py-0.5 rounded-full">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis.missingSkills.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-1">Missing skills</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.missingSkills.map((skill) => (
              <span key={skill} className="text-xs bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {analysis.suggestions.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-1">Suggestions</p>
          <ul className="text-sm text-gray-700 list-disc list-inside space-y-0.5">
            {analysis.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
