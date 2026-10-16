import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { pluralize } from "../../lib/format";
import { canChangeRoles } from "../../lib/superapp/policy/messages";
import { fetchMembers, setMemberRole } from "../../slices/channelsSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { ChannelRole, IChannel, IChannelMember } from "../../types/Message";
import Avatar from "../common/Avatar";
import { Button } from "../common/Button";
import Dialog from "../common/Dialog";

const SECTIONS: { role: ChannelRole; title: string }[] = [
  { role: "owner", title: "Owner" },
  { role: "moderator", title: "Moderators" },
  { role: "member", title: "Members" },
];

function RoleButton({
  handle,
  member,
  onChanging,
}: {
  handle: string;
  member: IChannelMember;
  /** Before the change: the list is read again afterwards. */
  onChanging: (username: string) => void;
}) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const next = member.role === "moderator" ? "member" : "moderator";
  const label = next === "moderator" ? "Make moderator" : "Remove moderator";
  const { fullname } = member.user;

  const change = async () => {
    if (busy) return;
    setBusy(true);
    try {
      onChanging(member.user.username);
      await dispatch(setMemberRole(handle, member.user.username, next));
      dispatch(
        showToast({
          message:
            next === "moderator"
              ? `${fullname} is now a moderator`
              : `${fullname} is no longer a moderator`,
        })
      );
    } catch (reason) {
      dispatch(showToast({ message: errorMessage(reason), tone: "error" }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={`${label}: ${fullname}`}
      aria-disabled={busy}
      onClick={change}
      className="aria-disabled:cursor-progress"
    >
      {label}
    </Button>
  );
}

interface MembersDrawerProps {
  channel: IChannel;
  open: boolean;
  onClose: () => void;
}

/**
 * The channel's info: its name, #handle and description, then its owner,
 * moderators and members. The owner can make members moderators (and
 * back). Read when opened.
 */
export default function MembersDrawer({
  channel,
  open,
  onClose,
}: MembersDrawerProps) {
  const dispatch = useAppDispatch();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const members = useAppSelector(
    (state) => state.channels.members[channel.handle]
  );
  const { handle } = channel;
  const owner = canChangeRoles(channel.viewer.role) && !readOnly;
  // A role change moves the person to another section, where their button
  // is a new one: once the list is read again, focus follows them there.
  const list = useRef<HTMLDivElement>(null);
  const moving = useRef<string | null>(null);

  useEffect(() => {
    if (open) dispatch(fetchMembers(handle)).catch(() => {});
  }, [dispatch, open, handle]);

  useEffect(() => {
    if (!moving.current || members?.status !== "loaded") return;
    list.current
      ?.querySelector<HTMLElement>(`[data-member="${moving.current}"] button`)
      ?.focus();
    moving.current = null;
  }, [members]);

  const items = members?.items ?? [];
  const listed = items.length;

  return (
    // Titled like the button that opens it: a handle has no place to wrap,
    // so it goes in the content, which can break it anywhere.
    <Dialog open={open} onClose={onClose} title="Channel info" variant="sheet">
      <div className="flex flex-col gap-4 text-[15px]">
        <div>
          <p className="text-[20px] font-extrabold leading-6 [overflow-wrap:anywhere]">
            {channel.name}
          </p>
          <p className="text-muted [overflow-wrap:anywhere]">#{handle}</p>
          {channel.description && (
            <p className="mt-1 [overflow-wrap:anywhere]">
              {channel.description}
            </p>
          )}
          <p className="mt-1 text-muted">
            {pluralize(channel.memberCount, "member")} · Public: anyone can read
            it, members can post.
          </p>
        </div>

        <div ref={list} aria-busy={members?.status === "loading"}>
          {members?.status === "failed" && listed === 0 ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-muted">{members.error}</p>
              <Button
                onClick={() => dispatch(fetchMembers(handle)).catch(() => {})}
              >
                Retry
              </Button>
            </div>
          ) : !members || (members.status === "loading" && listed === 0) ? (
            <p className="text-muted">Loading members…</p>
          ) : (
            SECTIONS.map(({ role, title }) => {
              const people = items.filter((member) => member.role === role);
              if (people.length === 0 && role !== "moderator") return null;
              return (
                <section key={role} className="mt-2 first:mt-0">
                  <h3 className="text-[17px] font-bold">{title}</h3>
                  {people.length === 0 ? (
                    <p className="py-2 text-muted">No moderators yet.</p>
                  ) : (
                    <ul>
                      {people.map((member) => (
                        <li
                          key={member.user.username}
                          data-member={member.user.username}
                          className="flex items-center gap-3 py-2"
                        >
                          <Avatar user={member.user} size={40} />
                          <Link
                            href={`/${member.user.username}`}
                            className="min-w-0 flex-1 leading-5"
                          >
                            <span className="block truncate font-bold hover:underline">
                              {member.user.fullname}
                            </span>
                            <span className="block truncate text-muted">
                              @{member.user.username}
                            </span>
                          </Link>
                          {owner && role !== "owner" && (
                            <RoleButton
                              handle={handle}
                              member={member}
                              onChanging={(username) => {
                                moving.current = username;
                              }}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          )}
          {members?.status === "loaded" && channel.memberCount > listed && (
            <p className="mt-2 text-[13px] text-muted">
              Showing the first {listed} members.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
