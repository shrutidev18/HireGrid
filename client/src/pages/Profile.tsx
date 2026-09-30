import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  User,
  Mail,
  Briefcase,
  TrendingUp,
  GraduationCap,
  Calendar,
  Tag,
  X,
  Lock,
  Save,
  Lightbulb,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { getProfile, updateProfile, updatePassword } from "../api/profile";
import { getResumes } from "../api/resumes";
import { useAuth } from "../context/AuthContext";

const EXPERIENCE_LEVELS = ["Student", "0-1 years", "1-3 years", "3-5 years", "5+ years"];

export default function Profile() {
  const { updateUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [education, setEducation] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");

  // only used for the "Resume Upload" line in the completion checklist -
  // don't need the actual resumes here, just whether there are any
  const [hasResumes, setHasResumes] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    getProfile().then((data) => {
      setName(data.name);
      setEmail(data.email);
      setTargetRole(data.targetRole || "");
      setExperienceLevel(data.experienceLevel || "");
      setEducation(data.education || "");
      setGraduationYear(data.graduationYear ? String(data.graduationYear) : "");
      setSkills(data.skills || []);
      setLoading(false);
    });

    getResumes().then((resumes) => setHasResumes(resumes.length > 0));
  }, []);

  function addSkill() {
    const value = skillInput.trim();
    if (value && !skills.includes(value)) {
      setSkills([...skills, value]);
    }
    setSkillInput("");
  }

  function handleSkillKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill();
    }
  }

  function removeSkill(skill: string) {
    setSkills(skills.filter((s) => s !== skill));
  }

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileError("");
    setProfileMessage("");

    if (!name || !email) {
      setProfileError("Name and email are required");
      return;
    }

    setSavingProfile(true);
    try {
      const updated = await updateProfile({
        name,
        email,
        targetRole: targetRole || null,
        experienceLevel: experienceLevel || null,
        education: education || null,
        graduationYear: graduationYear ? Number(graduationYear) : null,
        skills,
      });
      updateUser({ name: updated.name, email: updated.email });
      setProfileMessage("Profile updated");
    } catch (err: any) {
      setProfileError(err.response?.data?.error || "Something went wrong, try again");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordMessage("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("All password fields are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password don't match");
      return;
    }

    setSavingPassword(true);
    try {
      await updatePassword(currentPassword, newPassword);
      setPasswordMessage("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err.response?.data?.error || "Something went wrong, try again");
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  const inputClass =
    "w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600";
  const plainInputClass =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600";

  // completion checklist - all based on real data already on the page,
  // nothing here is fabricated. "Personal Information" is always done
  // since name/email are required to have an account in the first place.
  const checklist = [
    { label: "Personal Information", done: true },
    { label: "Career Details", done: Boolean(targetRole && experienceLevel) },
    { label: "Skills", done: skills.length > 0 },
    { label: "Education Details", done: Boolean(education && graduationYear) },
    { label: "Resume Upload", done: hasResumes },
  ];
  const completedCount = checklist.filter((item) => item.done).length;
  const completionPercent = Math.round((completedCount / checklist.length) * 100);

  // plain svg ring, no charting library - radius 40, circumference = 2 * pi * r
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const ringOffset = circumference * (1 - completionPercent / 100);

  return (
    <div className="max-w-6xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Profile</h1>
      <p className="text-sm text-gray-500 mb-6">Your details, and the account you sign in with.</p>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <div className="flex-1 w-full space-y-6">
          <form
            onSubmit={handleProfileSubmit}
            className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm space-y-5"
          >
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <div className="w-10 h-10 bg-app-bg rounded-xl flex items-center justify-center text-blue-700">
                <User size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Personal Information</h2>
                <p className="text-xs text-gray-500">Used across the app, and to help tailor your job search.</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Account</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">This is what you sign in with.</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Career</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target role</label>
                  <div className="relative">
                    <Briefcase size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      placeholder="e.g. Backend Engineer"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Experience level</label>
                  <div className="relative">
                    <TrendingUp size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <select
                      value={experienceLevel}
                      onChange={(e) => setExperienceLevel(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">-- select --</option>
                      {EXPERIENCE_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Education</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Education</label>
                  <div className="relative">
                    <GraduationCap size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={education}
                      onChange={(e) => setEducation(e.target.value)}
                      placeholder="e.g. BTech (Computer Science)"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Graduation year</label>
                  <div className="relative">
                    <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="number"
                      value={graduationYear}
                      onChange={(e) => setGraduationYear(e.target.value)}
                      placeholder="e.g. 2026"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Skills</p>
              <div className="relative">
                <Tag size={16} className="absolute left-3 top-3 text-gray-400" />
                <div className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm flex flex-wrap gap-2 items-center focus-within:ring-2 focus-within:ring-blue-600">
                  {skills.map((skill) => (
                    <span
                      key={skill}
                      className="flex items-center gap-1 bg-app-bg text-blue-800 text-xs font-medium px-2 py-1 rounded-full"
                    >
                      {skill}
                      <button type="button" onClick={() => removeSkill(skill)} className="hover:text-blue-950">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  <input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={handleSkillKeyDown}
                    onBlur={addSkill}
                    placeholder={skills.length === 0 ? "Add a skill and press Enter..." : "Add another skill..."}
                    className="flex-1 min-w-[140px] outline-none py-0.5"
                  />
                </div>
              </div>
            </div>

            {profileError && <p className="text-sm text-red-600">{profileError}</p>}
            {profileMessage && <p className="text-sm text-green-600">{profileMessage}</p>}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="flex items-center justify-center gap-2 bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                <Save size={14} />
                {savingProfile ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>

          <form
            onSubmit={handlePasswordSubmit}
            className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm space-y-4"
          >
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <div className="w-10 h-10 bg-app-bg rounded-xl flex items-center justify-center text-blue-700">
                <Lock size={18} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Change Password</h2>
                <p className="text-xs text-gray-500">Update the password you use to log in.</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={plainInputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={plainInputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={plainInputClass}
                />
              </div>
            </div>

            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            {passwordMessage && <p className="text-sm text-green-600">{passwordMessage}</p>}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingPassword}
                className="bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-50"
              >
                {savingPassword ? "Saving..." : "Change password"}
              </button>
            </div>
          </form>
        </div>

        <div className="w-full lg:w-80 shrink-0 space-y-6">
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative shrink-0 w-[72px] h-[72px]">
                <svg width="72" height="72" viewBox="0 0 96 96" className="-rotate-90">
                  <circle cx="48" cy="48" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
                  <circle
                    cx="48"
                    cy="48"
                    r={radius}
                    fill="none"
                    stroke="#0f766e"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={ringOffset}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-900">
                  {completionPercent}%
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Profile Completion</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {completionPercent === 100
                    ? "Nice - your profile is all filled in."
                    : "Fill in the rest to get the full picture at a glance."}
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-sm">
                  {item.done ? (
                    <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
                  ) : (
                    <Circle size={16} className="text-gray-300 shrink-0" />
                  )}
                  <span className={item.done ? "text-gray-700" : "text-gray-400"}>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={18} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-900">Pro Tip</h3>
            </div>
            <p className="text-sm text-gray-600">
              Keeping your target role and skills up to date makes it easier to spot which applications are the best
              fit, at a glance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
