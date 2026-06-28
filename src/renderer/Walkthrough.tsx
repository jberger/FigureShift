import { useState, type ReactNode } from 'react';

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: 'Welcome to FigureShift',
    body: (
      <>
        FigureShift uploads your typewriter photos to the <strong>Typewriter Database</strong> (TWDB), in
        bulk — so you can clear a big backlog without re-entering everything by hand.
      </>
    ),
  },
  {
    title: 'Sign in',
    body: (
      <>
        Use your <strong>TWDB account</strong> — the same login as the website.
        <br />
        <br />
        Your password is stored only on this computer, in its secure credential store (
        <strong>Keychain</strong> on macOS, <strong>Credential Manager</strong> on Windows). It is never
        sent anywhere except to log in to the Typewriter Database.
      </>
    ),
  },
  {
    title: 'Organize your photos',
    body: (
      <>
        Put each typewriter's photos in <strong>its own folder</strong>, and name the folder like{' '}
        <em>"Smith-Corona Silent 1948"</em> so FigureShift can pre-fill the make, model, and year.
        <br />
        <br />
        Then pick the folder that holds all of those machine folders — any folder containing photos
        becomes one machine.
      </>
    ),
  },
  {
    title: 'Review each machine',
    body: (
      <>
        FigureShift guesses the make, model, and year from each folder's name. Check them, then add the{' '}
        <strong>serial number</strong> and a <strong>description</strong>.
      </>
    ),
  },
  {
    title: 'Pick photo roles',
    body: (
      <>
        For each machine, choose one <strong>cover</strong> photo and one <strong>type sample</strong>; the
        rest are <strong>gallery</strong> photos. Mark any you don't want uploaded as <strong>skip</strong>.
        You can crop or rotate a photo with <strong>Edit</strong>.
      </>
    ),
  },
  {
    title: 'Push to the database',
    body: (
      <>
        When a machine is ready, click <strong>Push to TWDB</strong> — or use <strong>Push all ready</strong>{' '}
        to upload everything in one go. Your progress is saved, so you can come back any time.
      </>
    ),
  },
];

export function Walkthrough({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal walkthrough" onClick={(e) => e.stopPropagation()}>
        <h3>{step.title}</h3>
        <p className="walkthrough-body">{step.body}</p>
        <div className="walkthrough-dots">
          {STEPS.map((_, n) => (
            <span key={n} className={n === i ? 'is-active' : ''} />
          ))}
        </div>
        <div className="walkthrough-nav">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Skip
          </button>
          <div className="row">
            {i > 0 && (
              <button className="btn btn-secondary" onClick={() => setI(i - 1)}>
                Back
              </button>
            )}
            {last ? (
              <button className="btn btn-primary" onClick={onClose}>
                Get started
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setI(i + 1)}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
