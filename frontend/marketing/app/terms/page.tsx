export const dynamic = 'force-static';

import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service - WazeApp",
  description: "WazeApp's terms of service governing the use of our WhatsApp AI automation platform.",
  alternates: {
    canonical: "/terms",
  },
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
          <div className="prose prose-lg mx-auto dark:prose-invert">
            <p className="text-muted-foreground">Last updated: May 2026</p>

            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using WazeApp through our website at wazeapp.ai, our dashboard at app.wazeapp.ai,
              our API at api.wazeapp.ai, or any related services (collectively, the &quot;Service&quot;), you acknowledge
              that you have read, understood, and agree to be bound by these Terms of Service (&quot;Terms&quot;). If you
              are using the Service on behalf of an organization, you represent and warrant that you have the authority
              to bind that organization to these Terms, and references to &quot;you&quot; shall include that organization.
            </p>
            <p>
              If you do not agree to these Terms, you must not access or use the Service. Your continued use of the
              Service following any modifications to these Terms constitutes your acceptance of the revised Terms.
            </p>

            <h2>2. Description of Service</h2>
            <p>
              WazeApp is an AI-powered WhatsApp automation platform that enables businesses and individuals to
              create, deploy, and manage intelligent WhatsApp agents. The Service includes, but is not limited to,
              the following features:
            </p>
            <ul>
              <li>AI-powered WhatsApp chatbot creation and management</li>
              <li>Knowledge base construction and document processing for contextual AI responses</li>
              <li>Real-time conversation management and monitoring</li>
              <li>Broadcast messaging and campaign management</li>
              <li>E-commerce features including product catalogs and order management</li>
              <li>Analytics and reporting on conversation metrics and agent performance</li>
              <li>Integration with multiple large language model (LLM) providers</li>
              <li>Voice message transcription and image analysis capabilities</li>
              <li>API access for programmatic integration with third-party systems</li>
            </ul>
            <p>
              WazeApp reserves the right to modify, update, or discontinue any feature of the Service at any time,
              with or without prior notice. We will make reasonable efforts to notify users of significant changes
              that may affect their use of the Service.
            </p>

            <h2>3. Account Registration</h2>
            <p>
              To use certain features of the Service, you must create an account. By registering for an account,
              you agree to the following:
            </p>
            <ul>
              <li>
                <strong>Age Requirement:</strong> You must be at least 18 years of age to create an account and
                use the Service. By registering, you represent and warrant that you meet this age requirement.
              </li>
              <li>
                <strong>Accurate Information:</strong> You agree to provide accurate, current, and complete
                information during the registration process and to update such information as necessary to keep
                it accurate, current, and complete.
              </li>
              <li>
                <strong>One Account Per Person:</strong> Each individual may maintain only one account. Creating
                multiple accounts for the purpose of abusing promotions, circumventing restrictions, or evading
                enforcement actions is strictly prohibited and may result in the termination of all associated accounts.
              </li>
              <li>
                <strong>Account Security:</strong> You are solely responsible for safeguarding your login
                credentials, including your password and any API keys associated with your account. You must not
                share your credentials with any third party. You agree to notify WazeApp immediately of any
                unauthorized use of your account or any other breach of security.
              </li>
              <li>
                <strong>Account Responsibility:</strong> You are responsible for all activities that occur under
                your account, whether or not you have authorized such activities. WazeApp shall not be liable for
                any loss or damage arising from your failure to maintain the security of your account.
              </li>
            </ul>

            <h2>4. Subscription Plans and Payment</h2>
            <p>
              WazeApp offers both free and paid subscription tiers. By subscribing to a paid plan, you agree to
              the following payment terms:
            </p>
            <ul>
              <li>
                <strong>Billing Cycles:</strong> Paid subscriptions are billed on a recurring basis, either
                monthly or annually, depending on the plan you select. The billing cycle begins on the date
                you subscribe to a paid plan.
              </li>
              <li>
                <strong>Auto-Renewal:</strong> All paid subscriptions automatically renew at the end of each
                billing cycle unless you cancel your subscription before the renewal date. You may cancel
                auto-renewal at any time through your account dashboard.
              </li>
              <li>
                <strong>Pricing and Currency:</strong> All prices are displayed in the currency specified on
                our pricing page. If your payment method uses a different currency, your bank or payment
                provider may apply currency conversion fees, which are your responsibility.
              </li>
              <li>
                <strong>Plan Changes:</strong> You may upgrade or downgrade your subscription plan at any time.
                Upgrades take effect immediately, and you will be charged a prorated amount for the remainder
                of the current billing cycle. Downgrades take effect at the start of the next billing cycle.
              </li>
              <li>
                <strong>Refund Policy:</strong> WazeApp offers a 14-day money-back guarantee for new paid
                subscriptions. If you are not satisfied with the Service, you may request a full refund within
                14 days of your initial purchase. Refund requests made after this period will be evaluated on a
                case-by-case basis. Refunds are not available for renewal charges unless required by applicable law.
              </li>
              <li>
                <strong>Quota Limits:</strong> Each subscription plan includes specific usage quotas, such as
                the number of AI agents, messages, conversations, and knowledge base documents. If you exceed
                your plan&apos;s quotas, certain features may be restricted until you upgrade to a higher tier
                or the next billing cycle begins.
              </li>
            </ul>

            <h2>5. Acceptable Use</h2>
            <p>
              You agree to use the Service only for lawful purposes and in accordance with these Terms. You
              shall not use the Service to:
            </p>
            <ul>
              <li>
                Send spam, bulk unsolicited messages, or any form of unauthorized commercial communications
                through WhatsApp or any other channel connected to the Service.
              </li>
              <li>
                Create, distribute, or transmit any content that is illegal, harmful, threatening, abusive,
                harassing, defamatory, vulgar, obscene, or otherwise objectionable.
              </li>
              <li>
                Engage in or facilitate harassment, bullying, intimidation, or discrimination of any kind.
              </li>
              <li>
                Upload, transmit, or distribute any malware, viruses, or other harmful code through the Service.
              </li>
              <li>
                Attempt to reverse engineer, decompile, disassemble, or otherwise derive the source code of
                the Service or any part thereof.
              </li>
              <li>
                Interfere with, disrupt, or impose an unreasonable burden on the Service&apos;s infrastructure,
                servers, or networks.
              </li>
              <li>
                Use the Service in any manner that violates WhatsApp&apos;s Terms of Service, Business Policy,
                or Commerce Policy, or any other applicable third-party terms.
              </li>
              <li>
                Impersonate any person or entity, or falsely represent your affiliation with any person or entity.
              </li>
              <li>
                Use the Service to collect, store, or process personal data in violation of applicable data
                protection laws, including but not limited to the General Data Protection Regulation (GDPR).
              </li>
              <li>
                Resell, sublicense, or provide access to the Service to third parties without WazeApp&apos;s
                prior written consent.
              </li>
            </ul>
            <p>
              WazeApp reserves the right to investigate and take appropriate action against anyone who, in
              WazeApp&apos;s sole discretion, violates this section, including but not limited to suspending or
              terminating the offender&apos;s account, reporting such activity to law enforcement authorities,
              and pursuing civil remedies.
            </p>

            <h2>6. WhatsApp Integration</h2>
            <p>
              The Service integrates with WhatsApp to provide AI-powered automation features. By using the
              WhatsApp integration features of the Service, you acknowledge and agree to the following:
            </p>
            <ul>
              <li>
                <strong>Compliance with WhatsApp Terms:</strong> You are solely responsible for ensuring that
                your use of the Service complies with WhatsApp&apos;s Terms of Service, Business Policy, and
                all other applicable Meta/WhatsApp policies. WazeApp is not responsible for any actions taken
                by WhatsApp or Meta against your account as a result of your use of the Service.
              </li>
              <li>
                <strong>No Affiliation with Meta:</strong> WazeApp is an independent platform and is not
                affiliated with, endorsed by, or sponsored by Meta Platforms, Inc., WhatsApp LLC, or any of
                their subsidiaries. &quot;WhatsApp&quot; and &quot;Meta&quot; are trademarks of their respective owners.
              </li>
              <li>
                <strong>Session Management:</strong> WhatsApp sessions may be disconnected due to various
                reasons, including but not limited to network issues, WhatsApp policy enforcement, or device
                changes. WazeApp does not guarantee continuous WhatsApp connectivity and is not liable for any
                disruptions, message failures, or data loss resulting from session disconnections.
              </li>
              <li>
                <strong>Message Delivery:</strong> WazeApp does not guarantee the delivery of messages sent
                through the WhatsApp integration. Message delivery is subject to WhatsApp&apos;s infrastructure
                and policies.
              </li>
            </ul>

            <h2>7. Intellectual Property</h2>
            <p>
              <strong>WazeApp&apos;s Intellectual Property:</strong> The Service, including its source code,
              design, user interface, logos, trademarks, documentation, and all associated intellectual property,
              is owned by WazeApp and is protected by applicable copyright, trademark, and other intellectual
              property laws. You are granted a limited, non-exclusive, non-transferable, revocable license to
              use the Service in accordance with these Terms. This license does not include the right to modify,
              distribute, sell, or create derivative works based on the Service.
            </p>
            <p>
              <strong>User Content:</strong> You retain all ownership rights to the content you upload, create,
              or transmit through the Service, including but not limited to knowledge base documents, AI agent
              configurations, conversation data, and business information (&quot;User Content&quot;). By using the
              Service, you grant WazeApp a limited, non-exclusive, worldwide license to process, store, and
              analyze your User Content solely for the purpose of providing and improving the Service, including
              training and operating AI features. This license terminates when you delete your User Content or
              close your account.
            </p>
            <p>
              <strong>Feedback:</strong> If you provide WazeApp with any feedback, suggestions, or ideas
              regarding the Service, you agree that WazeApp may freely use, disclose, reproduce, and exploit
              such feedback without any obligation to you.
            </p>

            <h2>8. Data and Privacy</h2>
            <p>
              Your use of the Service is also governed by our Privacy Policy, which describes how we collect,
              use, store, and protect your personal information. By using the Service, you consent to the
              practices described in our Privacy Policy. Please review our{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>{" "}
              for detailed information about our data practices.
            </p>
            <p>
              You are responsible for ensuring that your use of the Service complies with all applicable data
              protection and privacy laws in your jurisdiction, including obtaining any necessary consents from
              individuals whose data you process through the Service.
            </p>

            <h2>9. AI-Generated Content</h2>
            <p>
              The Service utilizes artificial intelligence and large language models to generate automated
              responses and content. By using the AI features of the Service, you acknowledge and agree to
              the following:
            </p>
            <ul>
              <li>
                <strong>No Guarantee of Accuracy:</strong> AI-generated responses and content are produced by
                machine learning models and may contain errors, inaccuracies, or inappropriate content. WazeApp
                does not warrant the accuracy, completeness, reliability, or suitability of any AI-generated content.
              </li>
              <li>
                <strong>User Responsibility:</strong> You are solely responsible for reviewing, verifying, and
                approving all AI-generated content before it is sent to end users or used for any business
                purpose. You should not rely on AI-generated content for critical decisions without independent
                verification.
              </li>
              <li>
                <strong>No Liability for AI Errors:</strong> WazeApp shall not be held liable for any damages,
                losses, or consequences arising from errors, omissions, or inaccuracies in AI-generated content,
                including but not limited to incorrect information provided to your customers or end users.
              </li>
              <li>
                <strong>Content Monitoring:</strong> While WazeApp implements safeguards to minimize harmful or
                inappropriate AI outputs, no system is perfect. You are encouraged to monitor AI-generated
                responses and report any issues to our support team.
              </li>
            </ul>

            <h2>10. Service Availability and SLA</h2>
            <p>
              WazeApp targets 99.9% uptime for the Service, measured on a monthly basis. However, the Service
              is provided on an &quot;as is&quot; and &quot;as available&quot; basis, and WazeApp does not guarantee
              uninterrupted, error-free, or secure access to the Service at all times.
            </p>
            <p>
              The following events are excluded from uptime calculations:
            </p>
            <ul>
              <li>Scheduled maintenance windows, which WazeApp will endeavor to announce in advance via email
                or dashboard notifications.</li>
              <li>Force majeure events, including but not limited to natural disasters, acts of war, government
                actions, or internet infrastructure failures beyond WazeApp&apos;s control.</li>
              <li>Outages caused by third-party services, including WhatsApp, LLM providers, cloud hosting
                providers, or payment processors.</li>
              <li>Issues arising from your own equipment, software, network connections, or misuse of the Service.</li>
            </ul>
            <p>
              WazeApp will make commercially reasonable efforts to restore the Service as quickly as possible
              in the event of any unplanned downtime. WazeApp shall not be liable for any loss or damage
              resulting from service unavailability.
            </p>

            <h2>11. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, WazeApp, its directors, employees, partners,
              agents, suppliers, and affiliates shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages, including but not limited to loss of profits, loss of data,
              loss of business, loss of goodwill, or other intangible losses, arising out of or in connection
              with your use of or inability to use the Service, whether based on warranty, contract, tort
              (including negligence), statute, or any other legal theory, even if WazeApp has been advised of
              the possibility of such damages.
            </p>
            <p>
              In no event shall WazeApp&apos;s total aggregate liability to you for all claims arising out of
              or relating to these Terms or the Service exceed the total amount you have paid to WazeApp in
              the twelve (12) months immediately preceding the event giving rise to the claim, or one hundred
              US dollars (USD $100), whichever is greater.
            </p>
            <p>
              Some jurisdictions do not allow the exclusion or limitation of certain damages. In such
              jurisdictions, WazeApp&apos;s liability shall be limited to the fullest extent permitted by law.
            </p>

            <h2>12. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless WazeApp, its officers, directors, employees,
              agents, and affiliates from and against any and all claims, liabilities, damages, losses, costs,
              and expenses (including reasonable attorneys&apos; fees) arising out of or in connection with:
            </p>
            <ul>
              <li>Your use of the Service or any activity under your account.</li>
              <li>Your violation of these Terms or any applicable law or regulation.</li>
              <li>Your violation of any third-party rights, including WhatsApp&apos;s Terms of Service.</li>
              <li>Any content you upload, transmit, or make available through the Service.</li>
              <li>Any AI-generated content sent through your account to end users.</li>
            </ul>

            <h2>13. Termination</h2>
            <p>
              <strong>Termination by You:</strong> You may terminate your account at any time by contacting
              our support team or through your account dashboard settings. Upon termination, your right to
              use the Service will cease immediately.
            </p>
            <p>
              <strong>Termination by WazeApp:</strong> WazeApp may suspend or terminate your account at any
              time, with or without cause, and with or without notice, if we reasonably believe that you have
              violated these Terms, engaged in fraudulent or illegal activity, or if your continued use of the
              Service poses a risk to WazeApp or other users.
            </p>
            <p>
              <strong>Effect of Termination:</strong> Upon termination of your account, WazeApp will retain
              your data for a period of thirty (30) days, during which you may request an export of your User
              Content by contacting our support team. After this 30-day period, WazeApp reserves the right to
              permanently delete all data associated with your account. Any provisions of these Terms that by
              their nature should survive termination shall survive, including but not limited to intellectual
              property provisions, limitation of liability, indemnification, and dispute resolution.
            </p>

            <h2>14. Governing Law and Dispute Resolution</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the Republic of
              Cameroon, without regard to its conflict of laws principles. Any disputes arising out of or
              relating to these Terms or the Service shall be subject to the exclusive jurisdiction of the
              competent courts of the Republic of Cameroon.
            </p>
            <p>
              Before initiating any formal legal proceedings, the parties agree to attempt to resolve any
              dispute through good-faith negotiation for a period of at least thirty (30) days. If the dispute
              cannot be resolved through negotiation, either party may pursue legal remedies as permitted by
              applicable law.
            </p>

            <h2>15. Changes to Terms</h2>
            <p>
              WazeApp reserves the right to modify or replace these Terms at any time at our sole discretion.
              If we make material changes to these Terms, we will notify you by email at the address associated
              with your account and/or by posting a prominent notice on the Service at least fifteen (15) days
              before the changes take effect.
            </p>
            <p>
              Your continued use of the Service after the effective date of any modifications to these Terms
              constitutes your acceptance of the updated Terms. If you do not agree with the modified Terms,
              you must stop using the Service and terminate your account.
            </p>

            <h2>16. General Provisions</h2>
            <ul>
              <li>
                <strong>Entire Agreement:</strong> These Terms, together with our Privacy Policy and any
                applicable subscription agreement, constitute the entire agreement between you and WazeApp
                regarding your use of the Service.
              </li>
              <li>
                <strong>Severability:</strong> If any provision of these Terms is found to be invalid or
                unenforceable by a court of competent jurisdiction, the remaining provisions shall remain
                in full force and effect.
              </li>
              <li>
                <strong>Waiver:</strong> The failure of WazeApp to enforce any right or provision of these
                Terms shall not constitute a waiver of such right or provision.
              </li>
              <li>
                <strong>Assignment:</strong> You may not assign or transfer your rights or obligations under
                these Terms without WazeApp&apos;s prior written consent. WazeApp may assign its rights and
                obligations under these Terms without restriction.
              </li>
            </ul>

            <h2>17. Contact Information</h2>
            <p>
              If you have any questions, concerns, or feedback regarding these Terms of Service, please
              contact us at:
            </p>
            <ul>
              <li>Email: <a href="mailto:legal@wazeapp.ai" className="text-primary hover:underline">legal@wazeapp.ai</a></li>
              <li>Contact page: <Link href="/contact" className="text-primary hover:underline">wazeapp.ai/contact</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
