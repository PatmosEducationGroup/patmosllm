import PrivacyContactForm from '@/components/PrivacyContactForm'

export const metadata = {
  title: 'Privacy Policy | MultiplyTools',
  description: 'Privacy Policy for MultiplyTools - Currently under legal review',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">
            <strong>Status:</strong> Under Legal Review
          </p>

          {/* Coming Soon Notice */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Coming Soon</h2>
            <p className="text-gray-700 mb-4">
              Our Privacy Policy is currently under legal review to ensure GDPR compliance and transparency for our users.
            </p>
            <p className="text-gray-700 mb-4">
              <strong>Expected Availability:</strong> December 2025
            </p>
            <p className="text-gray-700">
              In the meantime, please know that we take your privacy seriously and:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 mt-4">
              <li>Only collect data necessary to provide our service</li>
              <li>Never sell or share your personal information with third parties</li>
              <li>Use industry-standard security measures to protect your data</li>
              <li>Allow you to access, correct, or delete your data at any time</li>
              <li>Process your data in accordance with GDPR requirements</li>
            </ul>
          </div>

          {/* Interim Notice */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">What We&apos;re Committed To</h2>
            <p className="text-gray-700 mb-4">
              While we finalize our formal Privacy Policy, here&apos;s what you should know:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>This is an invitation-only beta service for theological research</li>
              <li>We collect minimal personal data (email, name, usage data)</li>
              <li>Your chat history and documents are stored securely</li>
              <li>We use trusted third-party services that comply with privacy regulations</li>
              <li>You have the right to request data deletion at any time</li>
            </ul>
          </section>

          {/* Contact Form */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Questions About Privacy?</h2>
            <p className="text-gray-700 mb-4">
              If you have questions about how we handle your data or privacy concerns, please use the form below to contact us.
            </p>
            <PrivacyContactForm />
          </section>

          {/* Terms of Service Link */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              View our{' '}
              <a href="/terms" className="text-blue-600 hover:underline">
                Terms of Service
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
