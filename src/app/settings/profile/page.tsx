'use client'

/**
 * Profile Settings Page
 * Update user name, email, and password
 */

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { Alert } from '@/components/ui/Alert'
import { Modal } from '@/components/ui/Modal'
import { User, Lock, Edit } from 'lucide-react'
import { logError } from '@/lib/logger'

interface UserProfile {
  name: string
  email: string
}

function ProfileContent() {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Current user profile
  const [profile, setProfile] = useState<UserProfile | null>(null)

  // Modal states
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: ''
  })

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  // Load user profile
  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    try {
      setLoading(true)
      const response = await fetch('/api/user/profile')

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('You must be logged in to view your profile. Please sign in to continue.')
        }
        throw new Error('Failed to fetch profile')
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to load profile')
      }

      const userProfile = {
        name: data.profile.name || data.profile.email?.split('@')[0] || 'User',
        email: data.profile.email
      }

      setProfile(userProfile)
      setProfileForm(userProfile)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load profile information'
      logError(err instanceof Error ? err : new Error('Failed to load profile'), {
        operation: 'loadProfile',
        component: 'ProfileSettings'
      })
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/user/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: profileForm.name,
          email: profileForm.email
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update profile')
      }

      // Update local state
      setProfile(profileForm)
      setShowProfileModal(false)

      addToast({
        title: 'Profile Updated',
        message: data.message || 'Your profile information has been updated successfully',
        type: 'success'
      })

      // Reload profile to get fresh data
      await loadProfile()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update profile. Please try again.'
      logError(err instanceof Error ? err : new Error('Profile update failed'), {
        operation: 'handleProfileUpdate',
        component: 'ProfileSettings'
      })
      setError(errorMessage)
      addToast({
        title: 'Update Failed',
        message: errorMessage,
        type: 'error'
      })
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match')
      setSaving(false)
      return
    }

    if (passwordForm.newPassword.length < 8) {
      setError('Password must be at least 8 characters long')
      setSaving(false)
      return
    }

    try {
      const response = await fetch('/api/user/update-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update password')
      }

      setShowPasswordModal(false)
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })

      addToast({
        title: 'Password Updated',
        message: data.message || 'Your password has been changed successfully',
        type: 'success'
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update password. Please try again.'
      logError(err instanceof Error ? err : new Error('Password update failed'), {
        operation: 'handlePasswordUpdate',
        component: 'ProfileSettings'
      })
      setError(errorMessage)
      addToast({
        title: 'Update Failed',
        message: errorMessage,
        type: 'error'
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-600">Loading profile...</div>
      </div>
    )
  }

  // If there's an authentication error and no profile, show login prompt
  if (error && !profile && error.includes('logged in')) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Profile Settings</h2>
          <p className="text-gray-600 mt-2">
            Manage your account information and security settings
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Authentication Required</h3>
              <p className="text-gray-600 mb-6">
                You must be logged in to view and edit your profile.
              </p>
              <Button
                onClick={() => window.location.href = '/'}
                className="mx-auto"
              >
                Go to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Profile Settings</h2>
          <p className="text-gray-600 mt-2">
            Manage your account information and security settings
          </p>
        </div>

        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Your personal account details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-200">
                <div>
                  <p className="text-sm font-medium text-gray-600">Full Name</p>
                  <p className="text-base text-gray-900 mt-1">{profile?.name || 'Not set'}</p>
                </div>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-gray-200">
                <div>
                  <p className="text-sm font-medium text-gray-600">Email Address</p>
                  <p className="text-base text-gray-900 mt-1">{profile?.email || 'Not set'}</p>
                </div>
              </div>

              <Button
                onClick={() => {
                  setProfileForm({ name: profile?.name || '', email: profile?.email || '' })
                  setShowProfileModal(true)
                }}
                className="w-full sm:w-auto flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Change Information
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Password Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Password
            </CardTitle>
            <CardDescription>
              Keep your account secure with a strong password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-200">
                <div>
                  <p className="text-sm font-medium text-gray-600">Password</p>
                  <p className="text-base text-gray-900 mt-1">••••••••••••</p>
                </div>
              </div>

              <Button
                onClick={() => {
                  setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
                  setError(null)
                  setShowPasswordModal(true)
                }}
                className="w-full sm:w-auto flex items-center gap-2"
              >
                <Lock className="w-4 h-4" />
                Change Password
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Profile Edit Modal */}
      <Modal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        title="Change Information"
      >
        <form onSubmit={handleProfileUpdate} className="space-y-4">
          {error && (
            <Alert variant="error">
              {error}
            </Alert>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name
            </label>
            <input
              type="text"
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-primary-400 outline-none"
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={profileForm.email}
              onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-primary-400 outline-none"
              placeholder="your.email@example.com"
            />
            <p className="text-xs text-gray-500 mt-1">
              We&apos;ll send a verification email if you change this address
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={saving}
              className="flex-1"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <button
              type="button"
              onClick={() => setShowProfileModal(false)}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Password Change Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="Change Password"
      >
        <form onSubmit={handlePasswordUpdate} className="space-y-4">
          {error && (
            <Alert variant="error">
              {error}
            </Alert>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Password
            </label>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-primary-400 outline-none"
              placeholder="Enter your current password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Password
            </label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-primary-400 outline-none"
              placeholder="Enter new password (min. 8 characters)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-400 focus:border-primary-400 outline-none"
              placeholder="Confirm new password"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={saving}
              className="flex-1"
            >
              {saving ? 'Updating...' : 'Update Password'}
            </Button>
            <button
              type="button"
              onClick={() => setShowPasswordModal(false)}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export default function ProfilePage() {
  return (
    <ToastProvider>
      <ProfileContent />
    </ToastProvider>
  )
}
