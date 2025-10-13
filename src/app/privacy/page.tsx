export const metadata = {
  title: 'Privacy Policy | MultiplyTools',
  description: 'Privacy Policy for MultiplyTools - Learn how we protect and process your data',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">
            <strong>Effective Date:</strong> November 15, 2025
          </p>

          {/* Introduction */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Introduction</h2>
            <p className="text-gray-700 mb-4">
              MultiplyTools is an educational platform providing access to theological resources and biblical study materials. Users ask research questions about theology, biblical interpretation, and ministry practices - similar to querying a library catalog or asking a reference librarian.
            </p>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">Important Clarifications</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>We do NOT collect, infer, or process data revealing your personal religious beliefs</li>
                <li>We do NOT use your questions to infer, profile, or predict your personal religious views</li>
                <li>Questions are processed as educational queries to retrieve relevant document content, not to profile or classify your faith positions</li>
                <li>We encourage users NOT to include personal devotional or prayer information in questions, as the Service is designed for educational research only</li>
              </ul>
            </div>

            <p className="text-gray-700">
              <strong>Legal Basis:</strong> Our processing of chat data is based on the performance of our contract with you (GDPR Article 6(1)(b)), as the chat interface is objectively necessary to deliver our document search service.
            </p>
          </section>

          {/* How We Process Your Data */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">How We Process Your Data</h2>
            <p className="text-gray-700 mb-4">
              We process different types of data based on different legal grounds under the GDPR:
            </p>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-300 border border-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Data Type
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Legal Basis (GDPR)
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Why We Process It
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <strong>Account data</strong> (email, name, user ID)
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <strong>Contract necessity</strong> (Art. 6(1)(b))
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      Required to create accounts and deliver service
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <strong>Chat questions & answers</strong>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <strong>Contract necessity</strong> (Art. 6(1)(b))
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      Core feature - objectively necessary for document search
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <strong>Session data</strong> (chat history, timestamps)
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <strong>Contract necessity</strong> (Art. 6(1)(b))
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      Technical necessity for multi-turn conversations
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <strong>Document metadata</strong> (search results, sources)
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <strong>Legitimate interest</strong> (Art. 6(1)(f))
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      Search quality improvement, content relevance
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <strong>Analytics</strong> (Sentry, Vercel Analytics)
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <strong>Your consent</strong> (Art. 6(1)(a))
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      Optional performance monitoring - you can opt out in settings
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <strong>Security logs</strong> (truncated IPs, rate limits)
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <strong>Legitimate interest</strong> (Art. 6(1)(f))
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      Fraud prevention, platform security, abuse detection
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Data We Collect */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data We Collect</h2>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li><strong>Account:</strong> Email, name, invitation details</li>
              <li><strong>Usage:</strong> Chat questions, answers, conversation history, session timestamps</li>
              <li><strong>Technical:</strong> Truncated IP addresses (last octet removed), browser user-agent, device type</li>
              <li><strong>Analytics:</strong> Error logs, page views, performance metrics (only with your consent)</li>
            </ul>
          </section>

          {/* Data Retention */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data Retention</h2>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li><strong>Active accounts:</strong> Indefinite retention while you use the service</li>
              <li><strong>Deletion requested:</strong> 30-day grace period (you can cancel anytime)</li>
              <li><strong>After 30 days:</strong> Permanent deletion from production database</li>
              <li><strong>Backups:</strong> Purged at 90 days post-deletion</li>
            </ul>
          </section>

          {/* Third-Party Service Providers */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Third-Party Service Providers</h2>
            <p className="text-gray-700 mb-4">
              We work with trusted third-party service providers to deliver our service. All providers are located in the United States and comply with GDPR requirements through Standard Contractual Clauses (SCCs).
            </p>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-300 border border-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Provider
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Service
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Data Transferred
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Privacy Policy
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">OpenAI</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Chat completions</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Questions, conversation context</td>
                    <td className="px-4 py-3 text-sm text-blue-600">
                      <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:underline">
                        View Policy
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">Voyage AI</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Text embeddings</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Questions, document content</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Contact for policy</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">Pinecone</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Vector search</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Embeddings, metadata</td>
                    <td className="px-4 py-3 text-sm text-blue-600">
                      <a href="https://www.pinecone.io/privacy/" target="_blank" rel="noopener noreferrer" className="hover:underline">
                        View Policy
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">Supabase</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Database</td>
                    <td className="px-4 py-3 text-sm text-gray-700">All user data</td>
                    <td className="px-4 py-3 text-sm text-blue-600">
                      <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:underline">
                        View Policy
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">Vercel</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Hosting</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Request logs, analytics</td>
                    <td className="px-4 py-3 text-sm text-blue-600">
                      <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:underline">
                        View Policy
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">Resend</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Email delivery</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Email addresses, invitation data</td>
                    <td className="px-4 py-3 text-sm text-blue-600">
                      <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:underline">
                        View Policy
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-sm text-gray-900">Sentry</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Error tracking</td>
                    <td className="px-4 py-3 text-sm text-gray-700">Error logs, user IDs (if consent given)</td>
                    <td className="px-4 py-3 text-sm text-blue-600">
                      <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" className="hover:underline">
                        View Policy
                      </a>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-500">
              <p className="text-sm text-gray-700">
                <strong>OpenAI Training Policy:</strong> We use OpenAI&apos;s API for chat responses. OpenAI does NOT use API data to train their models. Data is retained for 30 days for abuse monitoring only, then deleted.{' '}
                <a href="https://openai.com/policies/api-data-usage-policies" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Learn more
                </a>
              </p>
            </div>
          </section>

          {/* Your Rights */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Your Rights</h2>
            <p className="text-gray-700 mb-4">
              Under GDPR, you have the following rights regarding your personal data:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li><strong>Access:</strong> Request a copy of all your personal data</li>
              <li><strong>Correction:</strong> Update your name, email, and preferences</li>
              <li><strong>Deletion:</strong> Request permanent deletion (30-day grace period)</li>
              <li><strong>Portability:</strong> Receive your data in machine-readable JSON format</li>
              <li><strong>Opt-out:</strong> Disable optional analytics (Sentry, Vercel)</li>
              <li><strong>Object:</strong> Object to processing based on legitimate interests</li>
            </ul>
            <p className="text-gray-700 mt-4">
              <strong>How to Exercise Your Rights:</strong> Visit your Privacy Settings at{' '}
              <a href="/settings/privacy" className="text-blue-600 hover:underline">/settings/privacy</a>{' '}
              or contact us at{' '}
              <a href="mailto:privacy@multiplytools.app" className="text-blue-600 hover:underline">
                privacy@multiplytools.app
              </a>
            </p>
          </section>

          {/* Data Security */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data Security</h2>
            <p className="text-gray-700 mb-4">
              We implement appropriate technical and organizational measures to protect your personal data:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2">
              <li>Encryption in transit (TLS/SSL) and at rest (AES-256)</li>
              <li>IP address truncation for privacy (last octet removed)</li>
              <li>Secure authentication with Supabase Auth</li>
              <li>Regular security audits and monitoring</li>
              <li>Access controls and role-based permissions</li>
            </ul>
          </section>

          {/* International Data Transfers */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">International Data Transfers</h2>
            <p className="text-gray-700">
              Your data may be transferred to and processed in the United States. We ensure GDPR compliance through Standard Contractual Clauses (SCCs) with all US-based service providers.
            </p>
          </section>

          {/* Children's Privacy */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Children&apos;s Privacy</h2>
            <p className="text-gray-700">
              Our service is not intended for individuals under 18 years of age. We do not knowingly collect personal data from minors. If you believe we have inadvertently collected data from a minor, please contact us immediately.
            </p>
          </section>

          {/* Changes to This Policy */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Changes to This Policy</h2>
            <p className="text-gray-700">
              We may update this Privacy Policy from time to time. We will notify you of material changes by email or through a notice on our platform. Your continued use after changes indicates acceptance of the updated policy.
            </p>
          </section>

          {/* Contact Us */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Contact Us</h2>
            <p className="text-gray-700">
              If you have questions about this Privacy Policy or wish to exercise your rights, please contact us:
            </p>
            <p className="text-gray-700 mt-2">
              <strong>Email:</strong>{' '}
              <a href="mailto:privacy@multiplytools.app" className="text-blue-600 hover:underline">
                privacy@multiplytools.app
              </a>
            </p>
          </section>

          {/* Footer Note */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Last updated: November 15, 2025
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
