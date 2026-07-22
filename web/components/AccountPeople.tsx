"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Member = { id: string; name: string | null; email: string; role: string };
type Invite = { id: string; email: string; role: string; orgId: string | null; orgName?: string | null; expiresAt: string };
type Entity = { id: string; name: string };

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
  const [ok, setOk] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setOk(null);
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
      setOk(data.emailed ? `Invitation emailed to ${email}.` : `Invitation created (email not configured — share the link).`);
      setInvites((p) => [{ id: data.invite.id, email, role: data.invite.role, orgId: data.invite.orgId, expiresAt: "" }, ...p]);
      setEmail("");
      setLoading(false);
      router.refresh();
    } catch { setError("Something went wrong."); setLoading(false); }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/tenants/${tenantId}/invites/${id}`, { method: "DELETE" });
    if (res.ok) setInvites((p) => p.filter((i) => i.id !== id));
  }

  const roleLabel = (i: Invite) =>
    i.orgId ? `${i.orgName ?? "entity"} · ${i.role}` : `account ${i.role}`;

  return (
    <div>
      <div className="divide-y rounded-xl border bg-card">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{m.name || m.email}</div>
              {m.name && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
            </div>
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">{m.role}</span>
          </div>
        ))}
        {invites.map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate text-sm">{i.email}</div>
                <div className="text-xs text-muted-foreground">Pending · {roleLabel(i)}</div>
              </div>
            </div>
            {canManage && (
              <button onClick={() => revoke(i.id)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Revoke invite">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <form onSubmit={invite} className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            type="email" required placeholder="coworker@company.com" value={email}
            onChange={(e) => setEmail(e.target.value)} className="h-9 min-w-[220px] flex-1"
          />
          <select
            value={access} onChange={(e) => setAccess(e.target.value)}
            className="h-9 rounded-md border border-input bg-white px-2 text-sm"
          >
            <optgroup label="Whole account">
              <option value="account:admin">Account admin (all entities)</option>
              <option value="account:member">Account member</option>
            </optgroup>
            {entities.length > 0 && (
              <optgroup label="Single entity">
                {entities.flatMap((en) => [
                  <option key={en.id + ":signer"} value={`org:${en.id}:signer`}>{en.name} · signer</option>,
                  <option key={en.id + ":viewer"} value={`org:${en.id}:viewer`}>{en.name} · viewer</option>,
                  <option key={en.id + ":admin"} value={`org:${en.id}:admin`}>{en.name} · admin</option>,
                ])}
              </optgroup>
            )}
          </select>
          <Button type="submit" disabled={loading || !email} className="h-9 gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Invite
          </Button>
        </form>
      )}
      {ok && <p className="mt-2 text-sm text-emerald-600">{ok}</p>}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
