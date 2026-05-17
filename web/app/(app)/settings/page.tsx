import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="border-b border-border px-8 py-5">
        <h1 className="font-display text-xl font-semibold text-ink">Settings</h1>
        <p className="font-mono text-xs text-ink-3">Account & negotiation defaults</p>
      </header>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-xl space-y-6 rounded-lg border border-border bg-surface p-6">
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" defaultValue="Marcus Allen" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" defaultValue="marcus@allenimports.co" />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="cap">Default price cap (per unit)</Label>
            <Input id="cap" defaultValue="$5.00" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost">Cancel</Button>
            <Button>Save changes</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
