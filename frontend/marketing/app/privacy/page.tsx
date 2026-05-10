export const dynamic = 'force-static';

import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy - WazeApp",
  description: "WazeApp's privacy policy explaining how we collect, use, and protect your data.",
  alternates: {
    canonical: "/privacy",
  },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
          <div className="prose prose-lg mx-auto dark:prose-invert">
            <p className="text-muted-foreground">Last updated: May 2026</p>

            {/* 1. Introduction */}
            <h2>1. Introduction</h2>
            <p>
              WazeApp (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the websites{" "}
              <strong>wazeapp.ai</strong> (marketing site) and{" "}
              <strong>app.wazeapp.ai</strong> (application dashboard), as well as the
              associated backend API at <strong>api.wazeapp.ai</strong>. WazeApp is a
              WhatsApp AI Agents SaaS platform that enables businesses to create and
              manage AI-powered WhatsApp bots.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you visit our websites, create an
              account, or use our services. Please read this policy carefully. By
              accessing or using our services, you acknowledge that you have read,
              understood, and agree to be bound by the terms of this Privacy Policy.
              If you do not agree with the terms of this policy, please do not access
              or use our services.
            </p>

            {/* 2. Information We Collect */}
            <h2>2. Information We Collect</h2>
            <p>
              We collect several types of information from and about users of our
              services, including the following:
            </p>

            <h3>2.1 Account Information</h3>
            <p>
              When you register for an account, we collect your name, email address,
              and password. If you choose to sign up via a third-party OAuth provider
              (Google, Facebook, or Microsoft), we receive your name, email address,
              and profile identifier from that provider. We also collect
              organization-level details such as your organization name and billing
              information.
            </p>

            <h3>2.2 WhatsApp Session Data</h3>
            <p>
              To provide our core service, we store WhatsApp session connection data
              that allows your AI agents to communicate on your behalf. This includes
              session tokens, connection state, and device-linking metadata. Session
              data is stored securely and is scoped to your organization.
            </p>

            <h3>2.3 Conversation Data</h3>
            <p>
              We store messages exchanged between your WhatsApp contacts and your AI
              agents. This includes text messages, media metadata (images, audio,
              video, documents), timestamps, sender and recipient identifiers, and
              message delivery statuses. Conversation data is isolated per
              organization and is never shared across organizations.
            </p>

            <h3>2.4 Knowledge Base Documents</h3>
            <p>
              When you upload documents to your knowledge base, we store the original
              files and process them into text chunks and vector embeddings for
              semantic search. These documents and their derived data remain scoped to
              your organization.
            </p>

            <h3>2.5 Usage Analytics</h3>
            <p>
              We collect usage metrics such as message volumes, API call counts,
              active session durations, feature usage patterns, and performance data.
              These metrics help us improve the platform, enforce subscription quotas,
              and provide you with analytics dashboards.
            </p>

            <h3>2.6 Payment Information</h3>
            <p>
              When you subscribe to a paid plan, we collect payment-related
              information necessary to process transactions. For mobile money
              payments (MTN, Orange), payment processing is handled by our
              third-party payment processor (S3P Maviance). We do not store full
              payment credentials on our servers; we retain only transaction
              references, subscription status, and billing history.
            </p>

            <h3>2.7 Technical Information</h3>
            <p>
              We automatically collect certain technical information when you access
              our services, including your IP address, browser type and version,
              device type, operating system, referring URLs, and pages visited within
              our application.
            </p>

            {/* 3. How We Use Your Information */}
            <h2>3. How We Use Your Information</h2>
            <p>We use the information we collect for the following purposes:</p>
            <ul>
              <li>
                <strong>Service Delivery:</strong> To provide, operate, and maintain
                our platform, including connecting your WhatsApp sessions, running
                your AI agents, processing conversations, and delivering real-time
                updates.
              </li>
              <li>
                <strong>AI Agent Operation:</strong> To power your AI agents by
                processing conversation data through large language models and
                retrieving relevant information from your knowledge base via vector
                search. AI training and fine-tuning data is scoped per organization
                and is never shared with or used to benefit other organizations.
              </li>
              <li>
                <strong>Analytics and Improvement:</strong> To generate usage
                analytics, monitor platform performance, identify and fix technical
                issues, and improve our services over time.
              </li>
              <li>
                <strong>Communication:</strong> To send you service-related
                notifications, respond to your support inquiries, and provide
                important updates about your account or our platform.
              </li>
              <li>
                <strong>Billing and Quota Management:</strong> To process payments,
                manage your subscription, enforce usage quotas, and maintain billing
                records.
              </li>
              <li>
                <strong>Security and Compliance:</strong> To detect and prevent fraud,
                enforce our terms of service, comply with legal obligations, and
                protect the rights and safety of our users and the public.
              </li>
            </ul>

            {/* 4. Data Processing for AI */}
            <h2>4. Data Processing for AI</h2>
            <p>
              Our platform uses artificial intelligence to power your WhatsApp
              agents. This section explains how your data is processed in the context
              of AI operations.
            </p>

            <h3>4.1 Conversation Processing</h3>
            <p>
              When your AI agent receives a message from a WhatsApp contact,
              the conversation content is sent to one or more third-party AI model
              providers to generate an appropriate response. We currently integrate
              with the following providers: <strong>OpenAI</strong>,{" "}
              <strong>DeepSeek</strong>, <strong>Mistral AI</strong>, and optionally
              self-hosted models via <strong>Ollama</strong> or{" "}
              <strong>RunPod</strong>. The specific provider used depends on your
              agent configuration and our intelligent routing system.
            </p>
            <p>
              Conversation data sent to these providers is used solely to generate
              responses and is subject to each provider&apos;s data processing
              policies. We select providers that offer data processing agreements
              and do not use customer data for training their models.
            </p>

            <h3>4.2 Knowledge Base and Vector Embeddings</h3>
            <p>
              Documents you upload to your knowledge base are processed into smaller
              text chunks and converted into vector embeddings (numerical
              representations). These embeddings are stored in our database and are
              scoped exclusively to your organization. They are used to perform
              semantic searches so your AI agents can retrieve relevant information
              when responding to messages. No other organization can access or
              benefit from your knowledge base data.
            </p>

            <h3>4.3 Media Processing</h3>
            <p>
              If your AI agent is configured to handle media (images, voice messages),
              these may be processed using vision models (Google Cloud Vision or local
              Ollama/Llava models) and speech-to-text services (Whisper) to extract
              content. Media files are processed for your organization only and are
              stored according to your data retention settings.
            </p>

            {/* 5. Data Sharing */}
            <h2>5. Data Sharing and Third-Party Processors</h2>
            <p>
              We do not sell, rent, or trade your personal data to third parties.
              We share your data only in the following circumstances:
            </p>
            <ul>
              <li>
                <strong>Cloud Hosting Providers:</strong> Our infrastructure is hosted
                on cloud servers that store and process your data on our behalf.
              </li>
              <li>
                <strong>AI Model Providers:</strong> As described in Section 4,
                conversation data is transmitted to AI model providers (OpenAI,
                DeepSeek, Mistral) to generate responses. These providers act as data
                processors and are contractually obligated to protect your data.
              </li>
              <li>
                <strong>Payment Processors:</strong> Payment information is shared
                with our payment processing partner (S3P Maviance) to process
                transactions securely.
              </li>
              <li>
                <strong>Analytics Providers:</strong> We use PostHog for product
                analytics to understand how our platform is used and to improve the
                user experience.
              </li>
              <li>
                <strong>Legal Requirements:</strong> We may disclose your data if
                required to do so by law, in response to a valid legal process, or to
                protect our rights, property, or safety, or the rights, property, or
                safety of others.
              </li>
            </ul>

            {/* 6. Data Retention */}
            <h2>6. Data Retention</h2>
            <p>We retain your data according to the following policies:</p>
            <ul>
              <li>
                <strong>Account Data:</strong> Your account information (name, email,
                organization details) is retained for as long as your account remains
                active. If you delete your account, we will remove your personal data
                within 30 days, except where retention is required by law.
              </li>
              <li>
                <strong>Conversation Data:</strong> Conversations and messages are
                retained according to your organization&apos;s settings. You may
                configure automatic retention periods or manually delete conversations
                at any time through the dashboard.
              </li>
              <li>
                <strong>Knowledge Base Data:</strong> Uploaded documents and their
                vector embeddings are retained until you delete them or delete your
                account.
              </li>
              <li>
                <strong>WhatsApp Sessions:</strong> Session data is retained while
                your session is active. When you disconnect a session or delete your
                account, session data is removed promptly.
              </li>
              <li>
                <strong>Usage Metrics and Logs:</strong> Aggregated usage metrics and
                system logs are retained for up to 12 months for analytics and
                debugging purposes. Audit logs may be retained longer where required
                for security or legal compliance.
              </li>
              <li>
                <strong>Deletion Requests:</strong> You may request deletion of your
                data at any time by contacting us at{" "}
                <a href="mailto:privacy@wazeapp.ai">privacy@wazeapp.ai</a>. We will
                process deletion requests within 30 days, subject to any legal
                retention obligations.
              </li>
            </ul>

            {/* 7. Your Rights (GDPR) */}
            <h2 id="data-deletion">7. Your Rights and Data Deletion</h2>
            <p>
              If you are located in the European Economic Area (EEA), the United
              Kingdom, or another jurisdiction with applicable data protection laws,
              you have the following rights regarding your personal data:
            </p>
            <ul>
              <li>
                <strong>Right of Access:</strong> You have the right to request a copy
                of the personal data we hold about you.
              </li>
              <li>
                <strong>Right to Rectification:</strong> You have the right to request
                that we correct any inaccurate or incomplete personal data we hold
                about you.
              </li>
              <li>
                <strong>Right to Erasure:</strong> You have the right to request that
                we delete your personal data, subject to certain legal exceptions.
              </li>
              <li>
                <strong>Right to Data Portability:</strong> You have the right to
                receive your personal data in a structured, commonly used, and
                machine-readable format, and to transmit that data to another
                controller.
              </li>
              <li>
                <strong>Right to Restriction of Processing:</strong> You have the
                right to request that we restrict the processing of your personal data
                under certain circumstances.
              </li>
              <li>
                <strong>Right to Object:</strong> You have the right to object to the
                processing of your personal data for certain purposes, including
                direct marketing and profiling.
              </li>
              <li>
                <strong>Right to Withdraw Consent:</strong> Where processing is based
                on your consent, you have the right to withdraw that consent at any
                time without affecting the lawfulness of processing carried out before
                the withdrawal.
              </li>
            </ul>
            <p>
              To exercise any of these rights, please contact us at{" "}
              <a href="mailto:privacy@wazeapp.ai">privacy@wazeapp.ai</a>. We will
              respond to your request within 30 days. You also have the right to
              lodge a complaint with your local data protection supervisory authority.
            </p>

            <h3>How to Delete Your Data</h3>
            <p>
              To request deletion of your data, you can:
            </p>
            <ul>
              <li>
                <strong>Delete your account:</strong> Go to your dashboard settings
                and click &quot;Delete Account&quot;. This will permanently remove all your
                personal data, conversations, and connected sessions.
              </li>
              <li>
                <strong>Disconnect Facebook/WhatsApp:</strong> Remove connected pages
                or sessions from your dashboard. All associated data will be deleted.
              </li>
              <li>
                <strong>Email us:</strong> Send a request to{" "}
                <a href="mailto:privacy@wazeapp.ai">privacy@wazeapp.ai</a> with
                the subject &quot;Data Deletion Request&quot;. We will process your request
                within 30 days.
              </li>
            </ul>

            {/* 8. Cookies and Tracking */}
            <h2>8. Cookies and Tracking</h2>
            <p>
              We use cookies and similar tracking technologies to operate our
              services and to collect usage information. The cookies we use fall into
              the following categories:
            </p>
            <ul>
              <li>
                <strong>Essential Cookies:</strong> These cookies are necessary for
                the operation of our platform. They include authentication tokens
                (JWT) stored in your browser to keep you logged in, session
                identifiers, and security-related cookies. You cannot opt out of
                essential cookies as they are required for the service to function.
              </li>
              <li>
                <strong>Analytics Cookies:</strong> We use{" "}
                <strong>PostHog</strong> for product analytics to understand how users
                interact with our platform, identify usability issues, and measure the
                effectiveness of features. PostHog may set cookies to distinguish
                unique users and sessions. You can opt out of analytics tracking
                through your browser settings or by using a browser extension that
                blocks tracking scripts.
              </li>
            </ul>
            <p>
              We do not use advertising cookies or third-party tracking cookies for
              ad targeting purposes.
            </p>

            {/* 9. International Data Transfers */}
            <h2>9. International Data Transfers</h2>
            <p>
              Your data may be processed on servers located in the European Union
              and/or the United States. When we transfer personal data outside of
              your jurisdiction, we ensure that appropriate safeguards are in place,
              including standard contractual clauses approved by the European
              Commission, or other legally recognized transfer mechanisms.
            </p>
            <p>
              Our third-party AI model providers (OpenAI, DeepSeek, Mistral) may
              process data in various jurisdictions. We ensure that these providers
              maintain appropriate data protection standards and have executed data
              processing agreements that comply with applicable data protection laws.
            </p>

            {/* 10. Children's Privacy */}
            <h2>10. Children&apos;s Privacy</h2>
            <p>
              Our services are not intended for individuals under the age of 16. We
              do not knowingly collect personal data from children under 16 years of
              age. If you are a parent or guardian and become aware that your child
              has provided us with personal data, please contact us at{" "}
              <a href="mailto:privacy@wazeapp.ai">privacy@wazeapp.ai</a>. If we
              become aware that we have collected personal data from a child under 16
              without verification of parental consent, we will take steps to remove
              that information from our servers promptly.
            </p>

            {/* 11. Data Security */}
            <h2>11. Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to
              protect your personal data against unauthorized access, alteration,
              disclosure, or destruction. These measures include:
            </p>
            <ul>
              <li>Encryption of data in transit using TLS/SSL.</li>
              <li>Hashing and salting of passwords.</li>
              <li>
                JWT-based authentication with short-lived access tokens and
                refresh token rotation.
              </li>
              <li>
                Rate limiting to prevent brute-force attacks and abuse.
              </li>
              <li>
                Organization-level data isolation ensuring that one
                organization&apos;s data is never accessible to another.
              </li>
              <li>
                Audit logging of security-relevant actions.
              </li>
              <li>
                Regular security reviews and updates of our dependencies and
                infrastructure.
              </li>
            </ul>
            <p>
              While we strive to protect your personal data, no method of
              transmission over the Internet or method of electronic storage is 100%
              secure. We cannot guarantee absolute security, but we are committed to
              maintaining industry-standard protections.
            </p>

            {/* 12. Changes to This Policy */}
            <h2>12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes
              in our practices, technologies, legal requirements, or other factors.
              When we make material changes to this policy, we will notify you by
              updating the &quot;Last updated&quot; date at the top of this page and,
              where appropriate, by sending you a notification via email or through
              our platform. We encourage you to review this Privacy Policy
              periodically to stay informed about how we are protecting your data.
            </p>
            <p>
              Your continued use of our services after any changes to this Privacy
              Policy constitutes your acceptance of the updated terms.
            </p>

            {/* 13. Contact Information */}
            <h2>13. Contact Information</h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy
              Policy or our data practices, please contact us:
            </p>
            <ul>
              <li>
                <strong>Email:</strong>{" "}
                <a href="mailto:privacy@wazeapp.ai">privacy@wazeapp.ai</a>
              </li>
              <li>
                <strong>Contact Page:</strong>{" "}
                <Link href="/contact">wazeapp.ai/contact</Link>
              </li>
            </ul>
            <p>
              We will make every effort to respond to your inquiry within 30 days.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
