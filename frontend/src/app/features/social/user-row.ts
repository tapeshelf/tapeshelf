import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { type SocialListItemDto } from '../../api';

/** What a row needs of a person; the lists' items carry more. */
export type UserCard = Pick<
  SocialListItemDto,
  'id' | 'username' | 'displayName' | 'avatarUrl' | 'pageHidden'
>;
import { AuthStore } from '../../core/auth/auth.store';
import { AvatarComponent } from '../../shared/ui/avatar/avatar';
import { profileLink } from '../../core/navigation/user-links';

/**
 * A person in a list: avatar, name and @username, linking to their page — unless they hid it
 * which only an admin may still open.
 */
@Component({
  selector: 'app-user-row',
  imports: [RouterLink, AvatarComponent],
  template: `
    <a
      [routerLink]="linkable() ? profileLink(user().username) : null"
      class="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 transition-colors"
      [class.hover:text-accent-text]="linkable()"
    >
      <app-avatar [url]="user().avatarUrl" [name]="user().displayName" [size]="40" />
      <span class="min-w-0">
        <span class="block truncate font-semibold">{{ user().displayName }}</span>
        <span class="label-mono block truncate text-muted">&#64;{{ user().username }}</span>
      </span>
    </a>
  `,
  host: { class: 'flex min-w-0 items-center gap-3' },
})
export class UserRowComponent {
  protected readonly profileLink = profileLink;
  private readonly auth = inject(AuthStore);
  readonly user = input.required<UserCard>();
  protected readonly linkable = computed(() => !this.user().pageHidden || this.auth.isAdmin());
}
