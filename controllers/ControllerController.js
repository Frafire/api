import e from 'express';
const router = e.Router();
import User from '../models/User.js';
import Role from '../models/Role.js';
import Certification from '../models/Certification.js';
import VisitApplication from '../models/VisitApplication.js';
import transporter from '../config/mailer.js';

import {isStaff, isMgt} from '../middleware/isStaff.js';

router.get('/', async ({res}) => {
	const home = await User.find({deletedAt: null, vis: false}).sort({
		rating: 'desc',
		lname: 'asc',
		fname: 'asc'
	}).populate({
		path: 'certifications',
		options: {
			sort: {order: 'desc'}
		}
	}).populate({
		path: 'roles',
		options: {
			sort: {order: 'asc'}
		}
	}).lean({virtuals: true});

	const visiting = await User.find({deletedAt: null, vis: true}).sort({
		rating: 'desc',
		lname: 'asc',
		fname: 'asc'
	}).populate({
		path: 'certifications',
		options: {
			sort: {order: 'desc'}
		}
	}).populate({
		path: 'roles',
		options: {
			sort: {order: 'asc'}
		}
	}).lean({virtuals: true});

	return res.json({
		"home": home,
		"visiting": visiting
	});
});

router.get('/staff', async (req, res) => {
	let users = await User.find().sort({
		lname: 'asc',
		fname: 'asc'
	}).populate({
		path: 'certifications',
		options: {
			sort: {order: 'desc'}
		}
	}).populate({
		path: 'roles',
		options: {
			sort: {order: 'asc'}
		}
	}).lean({virtuals: true});

	users = users.filter(user => "roles" in user);

	const staff = {
		atm: {
			title: "Air Traffic Manager",
			code: "atm",
			users: []
		},
		datm: {
			title: "Deputy Air Traffic Manager",
			code: "datm",
			users: []
		},
		ta: {
			title: "Training Administrator",
			code: "ta",
			users: []
		},
		ec: {
			title: "Events Coordinator",
			code: "ec",
			users: []
		},
		wm: {
			title: "Web Team",
			code: "wm",
			users: []
		},
		fe: {
			title: "Facility Engineer",
			code: "fe",
			users: []
		},
		ins: {
			title: "Instructors",
			code: "instructors",
			users: []
		},
		mtr: {
			title: "Mentors",
			code: "instructors",
			users: []
		},
	};

	users.forEach(user => user.roles.forEach(role => staff[role.code].users.push(user)));

	return res.json(staff);
});

router.get('/oi', async (req, res) => {
	const oi = await User.find({deletedAt: null}).select('oi').lean();
	return res.json(oi);
});

router.get('/:cid', async (req, res) => {
	const user = await User.findOne({cid: req.params.cid}).populate('roles').populate('certifications').lean({virtuals: true});
	return res.json(user);
});

router.post('/visit', async (req, res) => {
	if(!req.body.cid) return res.sendStatus(400);
	VisitApplication.create({
		cid: req.body.cid,
		fname: req.body.fname,
		lname: req.body.lname,
		rating: req.body.rating,
		email: req.body.email,
		home: req.body.home,
		reason: req.body.reason
	}).then(() =>{
		transporter.sendMail({
			to: req.body.email,
			subject: `Visiting Application Received | Albuquerque ARTCC`,
			template: 'visitReceived',
			context: {
				name: `${ req.body.fname} ${ req.body.lname}`,
			}
		});
		return res.sendStatus(200);
	}).catch((err) => {
		console.log(err);
		return res.sendStatus(500);
	});
	
});

router.get('/visit/applications', isMgt, async ({res}) => {
	try {
		const applications = await VisitApplication.find({deletedAt: null, acceptedAt: null}).lean();
		return res.json(applications);
	} catch(e) {
		console.log(e);
		return res.sendStatus(500);
	}
});

router.put('/visit/applications/approve/:id', isMgt, async (req, res) => {
	try {
		const application = await VisitApplication.findByIdAndUpdate(req.params.id, {
			acceptedAt: new Date()
		});
		await transporter.sendMail({
			to: application.email,
			subject: `Visiting Application Accepted | Albuquerque ARTCC`,
			template: 'visitAccepted',
			context: {
				name: `${ application.fname} ${ application.lname}`,
			}
		});
		return res.sendStatus(200);
	} catch(e) {
		console.log(e);
		return res.sendStatus(500);
	}
});


router.put('/visit/applications/reject/:id', isMgt, async (req, res) => {
	try {
		const application = await VisitApplication.findById(req.params.id).lean();
		await VisitApplication.deleteById(req.params.id);
		await transporter.sendMail({
			to: application.email,
			subject: `Visiting Application Rejected | Albuquerque ARTCC`,
			template: 'visitRejected',
			context: {
				name: `${ application.fname} ${ application.lname}`,
				reason: req.body.reason
			}
		});
		return res.sendStatus(200);
	} catch(e) {
		console.log(e);
		return res.sendStatus(500);
	}
});

router.post('/:cid', isStaff, async (req, res) => {
	if(!req.body.form) return res.sendStatus(400);
	const {fname, lname, email, oi, roles, certs} = req.body.form;
	const toApply = {
		roles: [],
		certifications: []
	};

	for(const [code, set] of Object.entries(roles)) {
		if(set) {
			const theRole = await Role.findOne({code}, 'id');
			toApply.roles.push(theRole.id);
		}
	}

	for(const [code, set] of Object.entries(certs)) {
		if(set) {
			const theCert = await Certification.findOne({code}, 'id');
			toApply.certifications.push(theCert.id);
		}
	}

	const updated = await User.updateOne({cid: req.params.cid}, {
		fname,
		lname, 
		email,
		oi,
		roles: toApply.roles,
		certifications: toApply.certifications,
	});

	if(updated.ok) {
		return res.sendStatus(200);
	} else {
		return res.sendStatus(500);
	}
});

export default router;