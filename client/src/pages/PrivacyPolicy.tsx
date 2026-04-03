/**
 * Privacy Policy Page
 *
 * Comprehensive TipHub.AI Privacy Policy with GDPR and international compliance.
 * Covers data collection, usage, disclosure, retention, and user rights.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Link } from 'wouter';
import { ArrowLeft, Shield, Eye, Lock, Database, UserCheck, Mail, Globe, Cookie, FileText, Users, AlertTriangle, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicy() {
  const lastUpdated = 'February 21, 2026';

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        {/* Back Button */}
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">TipHub.AI Privacy Policy</h1>
          </div>
          <p className="text-muted-foreground">
            Last updated: {lastUpdated}
          </p>
        </div>

        {/* Introduction */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <p className="text-muted-foreground leading-relaxed">
              This Privacy Policy explains how TipHub.AI ("TipHub," "we," "us," or "our") collects, uses, discloses, retains, and protects Personal Information when you access our websites, applications, and related services (collectively, the "Platform"). This Policy applies to visitors ("Users") and registered customers ("Clients"), together "you" or "your."
            </p>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using the Platform, you acknowledge you have read and understood this Privacy Policy. If you do not agree, do not use the Platform.
            </p>
            <div className="bg-muted/50 p-4 rounded-lg border">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Important:</strong> This Platform provides a research experience and may involve features associated with financial markets. Privacy and recordkeeping requirements may therefore be subject to heightened regulatory and compliance obligations, including retention and audit requirements.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Section 1: Scope; Definitions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              1. Scope; Definitions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">1.1 Scope</h3>
              <p className="text-muted-foreground text-sm mb-2">
                This Privacy Policy applies to Personal Information we process in connection with:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
                <li>Platform access and use;</li>
                <li>account registration and administration;</li>
                <li>communications and support;</li>
                <li>security, fraud prevention, and compliance operations; and</li>
                <li>any other interaction you have with TipHub through the Platform.</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-3">
                This Policy does not cover third-party websites, applications, or services you may access through links on the Platform. Their privacy practices are governed by their own policies.
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">1.2 Definitions</h3>
              <ul className="text-sm text-muted-foreground space-y-3">
                <li>
                  <strong className="text-foreground">"Personal Information"</strong> means information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked (directly or indirectly) to an individual.
                </li>
                <li>
                  <strong className="text-foreground">"Sensitive Personal Information"</strong> (where defined by law) may include government identifiers, account log-in credentials, precise geolocation, financial account information, and other categories defined under applicable law.
                </li>
                <li>
                  <strong className="text-foreground">"Processing"</strong> means any operation performed on Personal Information (e.g., collecting, storing, using, disclosing, or deleting).
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Information We Collect */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              2. Information We Collect
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              We collect Personal Information from (a) you, (b) your use of the Platform, and (c) third parties.
            </p>

            <div>
              <h3 className="font-semibold mb-2">2.1 Information You Provide to Us</h3>

              <div className="space-y-3 ml-2">
                <div>
                  <h4 className="text-sm font-medium">A. Basic and Contact Information</h4>
                  <p className="text-sm text-muted-foreground">
                    name, email address, phone number, date of birth, country of residence.
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-medium">B. Account and Profile Information</h4>
                  <p className="text-sm text-muted-foreground">
                    username and password (credentials), profile picture, trading preferences, settings, and similar account details.
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-medium">C. Communications</h4>
                  <p className="text-sm text-muted-foreground">
                    messages you send to us (e.g., emails or in-Platform support requests), reports you submit, and feedback.
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-medium">D. Verification / Compliance Information (as applicable)</h4>
                  <p className="text-sm text-muted-foreground">
                    information used to verify identity and/or meet legal obligations (e.g., proof of identity, proof of address, sanctions/PEP screening results, and similar compliance-related data), to the extent required by law and/or our risk controls.
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-medium">E. Payment / Transactional Information (as applicable)</h4>
                  <p className="text-sm text-muted-foreground">
                    billing details and payment method information, and records of payments (typically processed by third-party payment processors).
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">2.2 Information Collected Automatically</h3>
              <p className="text-sm text-muted-foreground mb-2">
                When you access or use the Platform, we automatically collect:
              </p>

              <div className="space-y-3 ml-2">
                <div>
                  <h4 className="text-sm font-medium">A. Device and Network Data</h4>
                  <p className="text-sm text-muted-foreground">
                    device type, operating system, browser type, IP address, device identifiers, network and connection information, and general location inferred from IP address.
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-medium">B. Usage and Activity Data</h4>
                  <p className="text-sm text-muted-foreground">
                    pages viewed, clicks, time spent, referral URLs, search queries on the Platform, interaction logs, and feature use.
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-medium">C. Security and Diagnostic Data</h4>
                  <p className="text-sm text-muted-foreground">
                    logs, audit trails, crash reports, authentication events, risk signals, and related diagnostic information.
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">2.3 Information From Third Parties</h3>
              <p className="text-sm text-muted-foreground mb-2">
                We may receive Personal Information from:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
                <li>identity verification and compliance providers;</li>
                <li>payment processors and fraud prevention vendors;</li>
                <li>analytics and advertising partners (subject to your choices and applicable law);</li>
                <li>market/financial data providers (generally non-personal, but may be linked to usage events); and</li>
                <li>service providers supporting hosting, communications, and customer support.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Cookies, Tracking Technologies */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cookie className="h-5 w-5" />
              3. Cookies, Tracking Technologies, and Similar Tools
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              We and our service providers may use cookies, SDKs, pixels, local storage, and similar technologies ("Tracking Technologies") to:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
              <li>operate and secure the Platform (e.g., session management, authentication);</li>
              <li>remember preferences;</li>
              <li>understand Platform usage and performance; and</li>
              <li>measure the effectiveness of communications and campaigns.</li>
            </ul>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">3.1 Your Choices</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Depending on your jurisdiction, you may be able to control Tracking Technologies via:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
                <li>your browser settings (blocking or deleting cookies);</li>
                <li>device settings (for mobile identifiers);</li>
                <li>our cookie banner/preferences tool (where deployed); and</li>
                <li>opting out of certain analytics or advertising features where available.</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Blocking cookies may affect Platform functionality.
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">3.2 Do Not Track</h3>
              <p className="text-sm text-muted-foreground">
                Some browsers offer a "Do Not Track" signal. Because there is no universally accepted standard, we do not respond to such signals in a uniform way.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: How We Use Personal Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              4. How We Use Personal Information (Purposes and Legal Bases)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              We use Personal Information to operate, provide, secure, and improve the Platform, and to comply with our legal obligations. Where required by law (e.g., GDPR/UK GDPR), we rely on one or more legal bases:
            </p>

            <div>
              <h3 className="font-semibold mb-2">4.1 Performance of a Contract</h3>
              <p className="text-sm text-muted-foreground mb-2">
                We process Personal Information as necessary to provide the Platform and fulfill our agreement with you, including to:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
                <li>create, manage, and maintain your account;</li>
                <li>provide Platform functionality, features, and access;</li>
                <li>provide customer support and respond to inquiries; and</li>
                <li>send service-related communications (e.g., security alerts, policy updates, transactional notices).</li>
              </ul>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">4.2 Compliance With Legal Obligations</h3>
              <p className="text-sm text-muted-foreground mb-2">
                We process Personal Information to comply with applicable laws and regulatory requirements, including to:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
                <li>verify identity (as required/appropriate);</li>
                <li>comply with AML/CTF, sanctions, market surveillance, and similar requirements (where applicable);</li>
                <li>satisfy recordkeeping, audit, and reporting obligations; and</li>
                <li>respond to lawful requests, subpoenas, court orders, or regulatory inquiries.</li>
              </ul>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">4.3 Legitimate Interests</h3>
              <p className="text-sm text-muted-foreground mb-2">
                We may process Personal Information where necessary for legitimate interests, including to:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
                <li>secure the Platform, prevent fraud, abuse, and unauthorized access;</li>
                <li>monitor, investigate, and remediate security incidents;</li>
                <li>conduct analytics, product development, and service improvement;</li>
                <li>maintain quality assurance and internal reporting; and</li>
                <li>enforce our terms and protect our legal rights.</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Where required, we balance our legitimate interests against your rights and expectations.
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">4.4 Consent</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Where required, we process Personal Information based on your consent, including for:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
                <li>certain cookies and Tracking Technologies;</li>
                <li>optional newsletters, educational content, and promotional communications; and</li>
                <li>specific optional features requiring access to device permissions.</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                You may withdraw consent at any time (see Section 10).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Section 5: How We Disclose Personal Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              5. How We Disclose Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              We disclose Personal Information only as described below (and as permitted by applicable law).
            </p>

            <div>
              <h3 className="font-semibold mb-2">5.1 Service Providers (Processors)</h3>
              <p className="text-sm text-muted-foreground mb-2">
                We disclose Personal Information to vendors performing services for us, such as:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
                <li><strong>Identity verification and compliance vendors:</strong> Basic, Verification/Compliance Information.</li>
                <li><strong>Payment processors and billing providers:</strong> Billing/Payment information; transaction records.</li>
                <li><strong>Communications providers (email, chat, notifications):</strong> Contact information; communications content.</li>
                <li><strong>Analytics and performance providers:</strong> Usage and device data (subject to settings/consent where required).</li>
                <li><strong>Security vendors:</strong> data needed to detect, prevent, or investigate fraud and security incidents.</li>
                <li><strong>Customer support platforms:</strong> contact information; communications; account metadata.</li>
                <li><strong>Hosting and infrastructure providers:</strong> data needed to host, store, and run the Platform.</li>
                <li><strong>Market data providers:</strong> typically non-personal data; may receive limited usage signals.</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Service providers are contractually required to protect Personal Information and use it only to provide services to TipHub.
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">5.2 Legal, Regulatory, and Compliance Disclosures</h3>
              <p className="text-sm text-muted-foreground mb-2">
                We may disclose Personal Information:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
                <li>to comply with applicable law, regulation, legal process, or governmental request;</li>
                <li>to regulators, law enforcement, or competent authorities as required;</li>
                <li>to detect, investigate, prevent, or address fraud, security, or technical issues; and/or</li>
                <li>to protect the rights, property, or safety of TipHub, our users, and others.</li>
              </ul>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">5.3 Business Transfers</h3>
              <p className="text-sm text-muted-foreground">
                If TipHub is involved in a merger, acquisition, financing, reorganization, bankruptcy, or sale of assets, Personal Information may be transferred as part of that transaction, subject to confidentiality protections and applicable law.
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">5.4 With Your Direction / Consent</h3>
              <p className="text-sm text-muted-foreground">
                We may disclose information with your instruction or consent, such as when you choose to integrate third-party tools or share content outwardly.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Section 6: International Data Transfers */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              6. International Data Transfers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Your Personal Information may be processed in countries other than your country of residence. Where required by applicable law, we implement appropriate safeguards for cross-border transfers, which may include:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
              <li>reliance on adequacy decisions (where applicable);</li>
              <li>standard contractual clauses or equivalent contractual mechanisms; and/or</li>
              <li>other lawful transfer mechanisms recognized by applicable law.</li>
            </ul>
          </CardContent>
        </Card>

        {/* Section 7: Data Retention and Recordkeeping */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              7. Data Retention and Recordkeeping
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              We retain Personal Information for as long as reasonably necessary to:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
              <li>provide and operate the Platform;</li>
              <li>comply with legal, regulatory, tax, accounting, and recordkeeping requirements;</li>
              <li>maintain audit trails and enforce compliance controls;</li>
              <li>resolve disputes and enforce agreements; and</li>
              <li>prevent fraud and maintain security.</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">
              Retention periods vary depending on the nature of the information and the purpose for which it is processed. When you close your account or request deletion, we will delete or de-identify information that is no longer required, while retaining information as required or permitted by law (including regulatory recordkeeping obligations).
            </p>
          </CardContent>
        </Card>

        {/* Section 8: Security */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              8. Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              We maintain administrative, technical, and physical safeguards designed to protect Personal Information, including:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
              <li>encryption of sensitive data where appropriate;</li>
              <li>access controls and authentication (including multi-factor authentication where available);</li>
              <li>logging, monitoring, and threat detection;</li>
              <li>vulnerability management, audits, and risk assessments; and</li>
              <li>incident response procedures and employee training.</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">
              No security measure is perfect. You are responsible for maintaining the confidentiality of your credentials and for all activity that occurs under your account.
            </p>
          </CardContent>
        </Card>

        {/* Section 9: Children's Privacy */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              9. Children's Privacy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              The Platform is not directed to children and is not intended for use by individuals under the age of 18 (or such higher age as required by applicable law). We do not knowingly collect Personal Information from children. If you believe a child has provided Personal Information to us, contact <a href="mailto:privacy@tiphub.ai" className="text-primary hover:underline">privacy@tiphub.ai</a>.
            </p>
          </CardContent>
        </Card>

        {/* Section 10: Your Rights and Choices */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              10. Your Rights and Choices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Depending on your location, you may have one or more of the following rights (subject to applicable law and certain exceptions):
            </p>
            <ul className="text-sm text-muted-foreground space-y-2 ml-2">
              <li><strong className="text-foreground">Access:</strong> request access to Personal Information we hold about you.</li>
              <li><strong className="text-foreground">Correction/Rectification:</strong> request correction of inaccurate or incomplete Personal Information.</li>
              <li><strong className="text-foreground">Deletion:</strong> request deletion of Personal Information (subject to retention obligations).</li>
              <li><strong className="text-foreground">Restriction:</strong> request we restrict processing in certain circumstances.</li>
              <li><strong className="text-foreground">Objection:</strong> object to processing based on legitimate interests (and certain other grounds).</li>
              <li><strong className="text-foreground">Portability:</strong> request a portable copy of certain Personal Information.</li>
              <li><strong className="text-foreground">Withdraw Consent:</strong> withdraw consent where processing is based on consent.</li>
              <li><strong className="text-foreground">Marketing Opt-Out:</strong> opt out of marketing communications at any time.</li>
            </ul>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">10.1 How to Exercise Rights</h3>
              <p className="text-sm text-muted-foreground">
                Email us at <a href="mailto:privacy@tiphub.ai" className="text-primary hover:underline">privacy@tiphub.ai</a>. We may request information to verify your identity and authority. We will respond within the timeframe required by applicable law.
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">10.2 Marketing and Informational Communications</h3>
              <p className="text-sm text-muted-foreground mb-2">
                You can opt out by:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
                <li>using unsubscribe links in emails;</li>
                <li>adjusting account preferences (if available); or</li>
                <li>contacting us at <a href="mailto:privacy@tiphub.ai" className="text-primary hover:underline">privacy@tiphub.ai</a>.</li>
              </ul>
              <p className="text-sm text-muted-foreground mt-2">
                Even if you opt out of marketing, we may still send non-marketing service communications (e.g., security alerts and account notices).
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">10.3 Authorized Agents (Where Applicable)</h3>
              <p className="text-sm text-muted-foreground">
                If permitted by law, you may designate an authorized agent to submit certain requests on your behalf. We may require proof of authorization and identity verification.
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">10.4 Appeals (Where Applicable)</h3>
              <p className="text-sm text-muted-foreground">
                If we deny your request, you may have the right to appeal our decision, where required by law. To appeal, contact <a href="mailto:privacy@tiphub.ai" className="text-primary hover:underline">privacy@tiphub.ai</a> with "Privacy Rights Appeal" in the subject line.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Section 11: Jurisdiction-Specific Disclosures */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              11. Jurisdiction-Specific Disclosures
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">11.1 EEA/UK (GDPR / UK GDPR)</h3>
              <p className="text-sm text-muted-foreground">
                If you are located in the EEA or the UK, you may also have the right to lodge a complaint with your local data protection authority. We encourage you to contact us first so we can try to resolve your concern.
              </p>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">11.2 United States (State Privacy Laws, Where Applicable)</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Depending on your state of residence, you may have additional rights, such as the right to opt out of certain "sales" or "sharing" of Personal Information for targeted advertising. To the extent applicable, TipHub will provide required notices and opt-out mechanisms.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> TipHub does not knowingly "sell" Personal Information in the traditional sense for monetary consideration; however, certain analytics/advertising relationships may be considered "sharing" under some state laws depending on implementation.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Section 12: Changes to This Privacy Policy */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              12. Changes to This Privacy Policy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              We may update this Privacy Policy from time to time. If we make material changes, we will provide notice via one or more of the following:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 ml-2">
              <li>posting an updated policy on our website;</li>
              <li>in-Platform notices; and/or</li>
              <li>email notification.</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">
              The "Last Updated" date at the top indicates when this Policy was most recently revised.
            </p>
          </CardContent>
        </Card>

        {/* Section 13: Contact Us */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              13. Contact Us
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              For questions, requests, or complaints regarding this Privacy Policy or our privacy practices:
            </p>
            <p className="mt-3">
              <strong className="text-foreground">Email:</strong>{' '}
              <a href="mailto:privacy@tiphub.ai" className="text-primary hover:underline">
                privacy@tiphub.ai
              </a>
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground py-8">
          <p>
            This privacy policy is effective as of {lastUpdated} and will remain in effect
            except with respect to any changes in its provisions in the future.
          </p>
        </div>
      </div>
    </div>
  );
}
