"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CopyButton } from "@/components/common/copy-button";
import { StatusBadge } from "@/components/common/status-badge";

type Member = { id: string; name: string | null; email: string; role: string };
type Invite = { id: string; email: string; role: string; orgId: string | null; orgName?: string | null; expiresAt: string };
type Entity = { id: string; name: string };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function AccountPeople({
  tenantId, members, initialInvites, entities, canManage,
}: {
  tenantId: string; members: Member[]; initialInvites: Invite[]; entities: Entity[]; canManage: boolean;
}) {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState("account:member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setLink(null);
    const parts = access.split(":");
    const body = parts[0] === "account"
      ? { email, role: parts[1] }
      : { email, orgId: parts[1], role: parts[2] };
    try {
      const res = await fetch(`/api/tenants/${tenantId}/invites`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not send invite"); setLoading(false); return; }
      if (data.emailed) toast.success(`Invitation sent to ${email}`);
      else setLink(data.link);
      setInvites((p) => [{ id: data.invite.id, email, role: data.invite.role, orgId: data.invite.orgId, expiresAt: "" }, ...p]);
      setEmail("");
      setLoading(false);
      router.refresh();
    } catch { setError("Something went wrong. Try again."); setLoading(false); }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/tenants/${tenantId}/invites/${id}`, { method: "DELETE" });
    if (res.ok) setInvites((p) => p.filter((i) => i.id !== id));
  }

  const inviteAccess = (i: Invite) =>
    i.orgId ? `${i.orgName ?? entities.find((e) => e.id === i.orgId)?.name ?? "Entity"} · ${i.role}` : `Account ${i.role}`;

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Access</TableHead>
              {canManage && <TableHead><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="w-full max-w-0">
                  <p className="truncate font-medium">{m.name || m.email}</p>
                  {m.name && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
                </TableCell>
                <TableCell><Badge variant="outline">{cap(m.role)}</Badge></TableCell>
                {canManage && <TableCell />}
              </TableRow>
            ))}
            {invites.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="w-full max-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{i.email}</span>
                    <StatusBadge tone="warning">Pending</StatusBadge>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{inviteAccess(i)}</Badge></TableCell>
                {canManage && (
                  <TableCell className="py-2 text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Revoke invite for ${i.email}`} onClick={() => revoke(i.id)}>
                      <X />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {canManage && (
        <form onSubmit={invite} className="flex flex-wrap gap-2">
          <Input
            type="email" required placeholder="name@company.com" aria-label="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} className="min-w-56 flex-1"
          />
          <Select value={access} onValueChange={setAccess}>
            <SelectTrigger aria-label="Access" className="rounded-md shadow-xs data-[size=default]:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectGroup>
                <SelectLabel>Whole account</SelectLabel>
                <SelectItem value="account:admin">Account admin</SelectItem>
                <SelectItem value="account:member">Account member</SelectItem>
              </SelectGroup>
              {entities.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Single entity</SelectLabel>
                    {entities.flatMap((en) => ["admin", "signer", "viewer"].map((r) => (
                      <SelectItem key={`${en.id}:${r}`} value={`org:${en.id}:${r}`}>{en.name} · {r}</SelectItem>
                    )))}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={loading || !email}>
            {loading && <Loader2 className="animate-spin" />}
            Invite
          </Button>
        </form>
      )}

      {link && (
        <Alert>
          <AlertDescription className="w-full">
            <p>Email isn&apos;t set up. Send them this link:</p>
            <div className="flex w-full items-center gap-2">
              <Input readOnly value={link} aria-label="Invite link" className="h-8 font-mono text-xs" onFocus={(e) => e.target.select()} />
              <CopyButton value={link} toastMessage="Invite link copied" />
            </div>
          </AlertDescription>
        </Alert>
      )}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    </div>
  );
}
