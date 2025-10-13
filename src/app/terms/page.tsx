import PrivacyContactForm from '@/components/PrivacyContactForm'

export const metadata = {
  title: 'Terms of Service | MultiplyTools',
  description: 'Terms of Service for MultiplyTools - Currently under legal review',
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-8">
            <strong>Status:</strong> Under Legal Review
          </p>

          {/* Coming Soon Notice */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Coming Soon</h2>
            <p className="text-gray-700 mb-4">
              Our Terms of Service are currently under legal review to ensure GDPR compliance and clarity for our users.
            </p>
            <p className="text-gray-700 mb-4">
              <strong>Expected Availability:</strong> December 2025
            </p>
            <p className="text-gray-700">
              In the meantime, by using MultiplyTools you agree to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 mt-4">
              <li>Use the service for educational and research purposes only</li>
              <li>Comply with all applicable laws and regulations</li>
              <li>Not misuse or abuse the platform</li>
              <li>Respect intellectual property rights</li>
            </ul>
          </div>

          {/* Interim Guidelines */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Interim Guidelines</h2>
            <p className="text-gray-700 mb-4">
              While we finalize our formal Terms of Service, please note:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>This is an invitation-only beta service for theological research</li>
              <li>You must be at least 18 years of age to use this service</li>
              <li>Your account and data are protected under our Privacy Policy</li>
              <li>We reserve the right to modify or discontinue features at any time</li>
              <li>Abuse of the service may result in account suspension</li>
            </ul>
          </section>

          {/* Contact Form */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Questions?</h2>
            <p className="text-gray-700 mb-4">
              If you have questions about our terms or service usage, please use the form below to contact us.
            </p>
            <PrivacyContactForm />
          </section>

          {/* Privacy Policy Link */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              View our{' '}
              <a href="/privacy" className="text-blue-600 hover:underline">
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
