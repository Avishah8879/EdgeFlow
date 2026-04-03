/**
 * Privacy Consent Banner Component
 *
 * Shows a consent banner at the bottom of the screen for new visitors.
 * Allows users to accept all tracking, manage preferences, or reject.
 */

import { useState } from 'react';
import { Shield, Settings, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { usePrivacyConsent, ConsentLevel } from '@/hooks/use-privacy-consent';
import { cn } from '@/lib/utils';

export function PrivacyConsentBanner() {
  const {
    showBanner,
    isUpdating,
    acceptAll,
    updateConsent,
    closeBanner,
  } = usePrivacyConsent();

  const [showPreferences, setShowPreferences] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<ConsentLevel>('essential');

  if (!showBanner) {
    return null;
  }

  const handleSavePreferences = () => {
    updateConsent(selectedLevel);
    setShowPreferences(false);
  };

  return (
    <>
      {/* Main Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t shadow-lg">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Shield className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
              <div>
                <p className="font-medium">We value your privacy</p>
                <p className="text-sm text-muted-foreground mt-1">
                  We use tracking to improve your experience and provide personalized features.
                  You can choose what data to share.{' '}
                  <a
                    href="/privacy-policy"
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Privacy Policy
                  </a>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreferences(true)}
                disabled={isUpdating}
              >
                <Settings className="h-4 w-4 mr-2" />
                Manage
              </Button>
              <Button
                size="sm"
                onClick={acceptAll}
                disabled={isUpdating}
              >
                <Check className="h-4 w-4 mr-2" />
                Accept All
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={closeBanner}
                disabled={isUpdating}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences Dialog */}
      <Dialog open={showPreferences} onOpenChange={setShowPreferences}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy Preferences
            </DialogTitle>
            <DialogDescription>
              Choose how much data you want to share with us.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <RadioGroup
              value={selectedLevel}
              onValueChange={(value) => setSelectedLevel(value as ConsentLevel)}
              className="space-y-4"
            >
              {/* Reject All */}
              <div
                className={cn(
                  'flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  selectedLevel === 'none' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                )}
                onClick={() => setSelectedLevel('none')}
              >
                <RadioGroupItem value="none" id="none" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="none" className="font-medium cursor-pointer">
                    No Tracking
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Only authentication and security events. No analytics or behavioral tracking.
                  </p>
                </div>
              </div>

              {/* Essential Only */}
              <div
                className={cn(
                  'flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  selectedLevel === 'essential' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                )}
                onClick={() => setSelectedLevel('essential')}
              >
                <RadioGroupItem value="essential" id="essential" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="essential" className="font-medium cursor-pointer">
                    Essential Only
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Authentication, security, page views, and feature usage.
                    Helps us improve the platform.
                  </p>
                </div>
              </div>

              {/* Accept All */}
              <div
                className={cn(
                  'flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  selectedLevel === 'all' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                )}
                onClick={() => setSelectedLevel('all')}
              >
                <RadioGroupItem value="all" id="all" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="all" className="font-medium cursor-pointer">
                    Accept All
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      (Recommended)
                    </span>
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Includes click events, search queries, and behavioral analytics.
                    Helps us personalize your experience.
                  </p>
                </div>
              </div>
            </RadioGroup>

            <p className="text-xs text-muted-foreground mt-4">
              You can change these preferences at any time in your{' '}
              <a href="/profile" className="text-primary hover:underline">
                profile settings
              </a>
              .
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPreferences(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePreferences}
              disabled={isUpdating}
            >
              Save Preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PrivacyConsentBanner;
