// Help.jsx - help centre: quick start, FAQ and (for administrators) a guide to the admin panel.
// The numbers in the answers (opening hours, limits...) come from the server, so they are never out of date.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/ui';

/** A simple open/close accordion (no Bootstrap JavaScript needed). */
function Accordion({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="accordion">
      {items.map((item, i) => (
        <div className="accordion-item" key={item.q}>
          <h3 className="accordion-header">
            <button type="button" className={`accordion-button ${open === i ? '' : 'collapsed'}`} onClick={() => setOpen(open === i ? -1 : i)}>
              {item.q}
            </button>
          </h3>
          {open === i && <div className="accordion-body small">{item.a}</div>}
        </div>
      ))}
    </div>
  );
}

export default function Help() {
  const { isAdmin } = useAuth();
  const [rules, setRules] = useState(null);
  useEffect(() => { api.get('/rooms/meta').then((m) => setRules(m.rules)).catch(() => {}); }, []);

  const r = rules || { openTime: '07:00', closeTime: '21:00', slotMinutes: 30, maxHours: 4, approvalAfterHours: 2, maxAdvanceDays: 14, maxActivePerUser: 5, minMinutes: 30 };

  const faq = [
    { q: 'How do I create an account?', a: <>Click <strong>Create account</strong> on the login page and fill in your name, student/staff number, email and a password (at least 8 characters with a letter and a number). Then log in with your email and password.</> },
    { q: 'I forgot my password. What do I do?', a: <>On the login page choose <strong>Forgot password?</strong>, enter your email and open the reset link. The link works once and expires after 30 minutes. If you are locked out, ask an administrator to reset it for you.</> },
    { q: 'How do I find a free room?', a: <>Open <Link to="/rooms">Rooms</Link>, choose the date and time you need, and optionally a minimum capacity or equipment such as a projector. Every room shows a badge: <em>Available</em>, <em>Booked</em> at that time, or <em>Maintenance</em>.</> },
    { q: 'How do I book a room?', a: <>Click <strong>Book now</strong> on an available room, check the date and times, enter the number of people and (optionally) the purpose, then press <strong>Confirm booking</strong>. The coloured strip shows which hours are already taken. You will get a notification under the bell icon.</> },
    { q: 'What are the booking rules?', a: <ul className="mb-0"><li>Rooms are open from {r.openTime} to {r.closeTime}.</li><li>Times must be on {r.slotMinutes}-minute marks (for example 09:00 or 09:30).</li><li>A booking lasts {r.minMinutes} minutes to {r.maxHours} hours.</li><li>You can book up to {r.maxAdvanceDays} days ahead.</li><li>You can hold at most {r.maxActivePerUser} upcoming bookings at once, and not two at the same time.</li></ul> },
    { q: 'Why is my booking "pending"?', a: <>Bookings longer than {r.approvalAfterHours} hours need an administrator&apos;s approval. The room is held for you meanwhile, and you receive a notification when it is approved or declined.</> },
    { q: 'The room was taken while I was booking. What happened?', a: <>Two people cannot book the same room at the same time. If someone confirmed first, the system tells you the slot is no longer free. Pick another time or room and try again.</> },
    { q: 'How do I change or cancel a booking?', a: <>Open <Link to="/my-bookings">My Bookings</Link>. Use <strong>Edit</strong> to change the date, time or number of people, or <strong>Cancel</strong> to release the room. A booking that has already started cannot be changed.</> },
    { q: 'Who do I contact if something is wrong?', a: <>Speak to the library desk or email your StudySpot administrator. Mention your booking number (for example #1024) so they can find it quickly.</> },
  ];

  const adminHelp = [
    { q: 'Dashboard', a: 'Shows totals, bookings per day and the latest bookings. The yellow box lists bookings that wait for approval.' },
    { q: 'Rooms', a: 'Add, edit, search and delete rooms, and choose their equipment. A room that has booking history cannot be deleted: set it to "maintenance" instead.' },
    { q: 'Users', a: 'Register users, edit details, suspend or re-activate accounts, and reset passwords (a temporary password is shown once). Only a Super Administrator can manage administrator accounts.' },
    { q: 'Bookings', a: 'Filter and sort every booking, approve pending ones, or cancel a booking with a reason. The user is notified.' },
    { q: 'Reports', a: 'Choose a report type, dates, room and sorting, press Generate, then Print / Save as PDF or export CSV. Each report carries the university name, logo and date.' },
    { q: 'Audit Logs', a: 'A record of who did what and when (logins, bookings, changes), useful for accountability.' },
  ];

  return (
    <>
      <PageHeader title="Help centre" icon="fa-circle-question" subtitle="Everything you need to book a study room." />

      <div className="card mb-4">
        <div className="card-body">
          <h2 className="h5 mb-3">Quick start</h2>
          <div className="row g-3 text-center">
            {[['1', 'fa-magnifying-glass', 'Search', 'Pick a date and time on the Rooms page.'],
              ['2', 'fa-calendar-plus', 'Book', 'Choose a free room and confirm your booking.'],
              ['3', 'fa-bell', 'Get confirmed', 'Check the bell icon and My Bookings.']].map(([n, icon, title, text]) => (
                <div className="col-md-4" key={n}>
                  <div className="stat-icon mx-auto mb-2"><i className={`fa-solid ${icon}`} /></div>
                  <div className="fw-semibold">{n}. {title}</div>
                  <div className="small text-muted">{text}</div>
                </div>
            ))}
          </div>
        </div>
      </div>

      <h2 className="h5 mb-2">Frequently asked questions</h2>
      <Accordion items={faq} />

      {isAdmin && (
        <>
          <h2 className="h5 mt-4 mb-2">For administrators</h2>
          <Accordion items={adminHelp} />
        </>
      )}
    </>
  );
}
