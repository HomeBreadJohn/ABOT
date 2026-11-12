"use client";

import { TriangleExclamationPoint } from "lucide-react";
import { Component, type ReactNode } from "react";

import { Btn, Callout } from "./ui";

/**
 * Isolates a crash to one report tab. The tab bar and the other panels keep
 * working, so a failure in "Ask" never wipes the report the user was reading.
 */
export class TabErrorBoundary extends Component<
  { children: ReactNode; label: string; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <Callout
          tone="high"
          icon={TriangleExclamationPoint}
          title={`${this.props.label} ran into a problem`}
          action={
            <Btn onClick={() => this.setState({ failed: false })}>Try again</Btn>
          }
        >
          The rest of this report still works. Switch tabs to keep reading, or
          try this one again.
        </Callout>
      );
    }
    return this.props.children;
  }
}
