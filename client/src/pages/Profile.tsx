import { useEffect, useState, type FormEvent } from "react";
import { getProfile, updateProfile, updatePassword } from "../api/profile";
import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { updateUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
      setLoading(false);
    });
  }, []);

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
      const updated = await updateProfile({ name, email });
      updateUser(updated);
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
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600";

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Profile</h1>

      <form
        onSubmit={handleProfileSubmit}
        className="space-y-4 bg-white p-6 rounded-2xl border border-teal-100 shadow-sm mb-6"
      >
        <h2 className="font-semibold text-gray-900">Your info</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>

        {profileError && <p className="text-sm text-red-600">{profileError}</p>}
        {profileMessage && <p className="text-sm text-green-600">{profileMessage}</p>}

        <button
          type="submit"
          disabled={savingProfile}
          className="bg-teal-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
        >
          {savingProfile ? "Saving..." : "Save"}
        </button>
      </form>

      <form
        onSubmit={handlePasswordSubmit}
        className="space-y-4 bg-white p-6 rounded-2xl border border-teal-100 shadow-sm"
      >
        <h2 className="font-semibold text-gray-900">Change password</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
        {passwordMessage && <p className="text-sm text-green-600">{passwordMessage}</p>}

        <button
          type="submit"
          disabled={savingPassword}
          className="bg-teal-700 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
        >
          {savingPassword ? "Saving..." : "Change password"}
        </button>
      </form>
    </div>
  );
}
