import { assert, expect } from 'chai';
import { SinonStub, stub } from 'sinon';

import { child_process } from 'mz';
import * as semver from 'semver';

import * as constants from '../src/lib/constants';
import {
	containerContractsFulfilled,
	validateContract,
} from '../src/lib/contracts';
import * as osRelease from '../src/lib/os-release';
import supervisorVersion = require('../src/lib/supervisor-version');

describe('Container contracts', () => {
	let execStub: SinonStub;
	before(() => {
		execStub = stub(child_process, 'exec').returns(
			Promise.resolve([
				Buffer.from('4.9.140-l4t-r32.2+g3dcbed5'),
				Buffer.from(''),
			]),
		);
	});

	after(() => {
		execStub.restore();
	});

	describe('Contract validation', () => {
		it('should correctly validate a contract with no requirements', () =>
			expect(
				validateContract({
					slug: 'user-container',
				}),
			).to.be.fulfilled);

		it('should correctly validate a contract with extra fields', () =>
			expect(
				validateContract({
					slug: 'user-container',
					name: 'user-container',
					version: '3.0.0',
				}),
			).to.be.fulfilled);

		it('should not validate a contract without the minimum required fields', () => {
			return Promise.all([
				expect(validateContract({})).to.be.rejected,
				expect(validateContract({ name: 'test' })).to.be.rejected,
				expect(validateContract({ requires: [] })).to.be.rejected,
			]);
		});

		it('should correctly validate a contract with requirements', () =>
			expect(
				validateContract({
					slug: 'user-container',
					requires: [
						{
							type: 'sw.l4t',
							version: '32.2',
						},
						{
							type: 'sw.supervisor',
						},
					],
				}),
			).to.be.fulfilled);

		it('should not validate a contract with requirements without the minimum required fields', () => {
			return expect(
				validateContract({
					slug: 'user-container',
					requires: [
						{
							version: '>3.0.0',
						},
					],
				}),
			).to.be.rejected;
		});
	});

	describe('Requirement resolution', () => {
		// Because the supervisor version will change whenever the
		// package.json will, we generate values which are above
		// and below the current value, and use these to reason
		// about the contract engine results
		const supervisorVersionGreater = `${semver.major(supervisorVersion)! +
			1}.0.0`;
		const supervisorVersionLesser = `${semver.major(supervisorVersion)! -
			1}.0.0`;

		before(async () => {
			// We ensure that the versions we're using for testing
			// are the same as the time of implementation, otherwise
			// these tests could fail or succeed when they shouldn't
			expect(await osRelease.getOSSemver(constants.hostOSVersionPath)).to.equal(
				'2.0.6',
			);
			assert(semver.gt(supervisorVersionGreater, supervisorVersion));
			assert(semver.lt(supervisorVersionLesser, supervisorVersion));
		});

		it('Should correctly run containers with no requirements', async () => {
			expect(
				await containerContractsFulfilled({
					service: {
						contract: {
							type: 'sw.container',
							slug: 'user-container',
						},
						optional: false,
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);
			expect(
				await containerContractsFulfilled({
					service: {
						contract: {
							type: 'sw.container',
							slug: 'user-container1',
						},
						optional: false,
					},
					service2: {
						contract: {
							type: 'sw.container',
							slug: 'user-container2',
						},
						optional: false,
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);
		});

		it('should correctly run containers whose requirements are satisfied', async () => {
			expect(
				await containerContractsFulfilled({
					service: {
						contract: {
							type: 'sw.container',
							name: 'user-container',
							slug: 'user-container',
							requires: [
								{
									type: 'sw.supervisor',
									version: `>${supervisorVersionLesser}`,
								},
							],
						},
						optional: false,
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);

			expect(
				await containerContractsFulfilled({
					service: {
						contract: {
							type: 'sw.container',
							name: 'user-container',
							slug: 'user-container',
							requires: [
								{
									type: 'sw.supervisor',
									version: `<${supervisorVersionGreater}`,
								},
							],
						},
						optional: false,
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);

			expect(
				await containerContractsFulfilled({
					service: {
						contract: {
							type: 'sw.container',
							name: 'user-container',
							slug: 'user-container',
							requires: [
								{
									type: 'sw.supervisor',
									version: `>${supervisorVersionLesser}`,
								},
							],
						},
						optional: false,
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);

			expect(
				await containerContractsFulfilled({
					service: {
						contract: {
							type: 'sw.container',
							name: 'user-container',
							slug: 'user-container',
							requires: [
								{
									type: 'sw.supervisor',
									version: `>${supervisorVersionLesser}`,
								},
								{
									type: 'sw.l4t',
									version: '32.2',
								},
							],
						},
						optional: false,
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);
			expect(
				await containerContractsFulfilled({
					service: {
						contract: {
							type: 'sw.container',
							name: 'user-container1',
							slug: 'user-container1',
							requires: [
								{
									type: 'sw.supervisor',
									version: `>${supervisorVersionLesser}`,
								},
							],
						},
						optional: false,
					},
					service2: {
						contract: {
							type: 'sw.container',
							name: 'user-container1',
							slug: 'user-container1',
							requires: [
								{
									type: 'sw.os',
									version: '<3.0.0',
								},
							],
						},
						optional: false,
					},
				}),
			)
				.to.have.property('valid')
				.that.equals(true);
		});

		it('Should refuse to run containers whose requirements are not satisfied', async () => {
			let fulfilled = await containerContractsFulfilled({
				service: {
					contract: {
						type: 'sw.container',
						name: 'user-container',
						slug: 'user-container',
						requires: [
							{
								type: 'sw.supervisor',
								version: `>=${supervisorVersionGreater}`,
							},
						],
					},
					optional: false,
				},
			});
			expect(fulfilled)
				.to.have.property('valid')
				.that.equals(false);
			expect(fulfilled)
				.to.have.property('unmetServices')
				.that.deep.equals(['service']);

			fulfilled = await containerContractsFulfilled({
				service2: {
					contract: {
						type: 'sw.container',
						name: 'user-container2',
						slug: 'user-container2',
						requires: [
							{
								type: 'sw.l4t',
								version: '28.2',
							},
						],
					},
					optional: false,
				},
			});
			expect(fulfilled)
				.to.have.property('valid')
				.that.equals(false);
			expect(fulfilled)
				.to.have.property('unmetServices')
				.that.deep.equals(['service2']);

			fulfilled = await containerContractsFulfilled({
				service: {
					contract: {
						type: 'sw.container',
						name: 'user-container1',
						slug: 'user-container1',
						requires: [
							{
								type: 'sw.supervisor',
								version: `>=${supervisorVersionLesser}`,
							},
						],
					},
					optional: false,
				},
				service2: {
					contract: {
						type: 'sw.container',
						name: 'user-container2',
						slug: 'user-container2',
						requires: [
							{
								type: 'sw.supervisor',
								version: `<=${supervisorVersionLesser}`,
							},
						],
					},
					optional: false,
				},
			});
			expect(fulfilled)
				.to.have.property('valid')
				.that.equals(false);
			expect(fulfilled)
				.to.have.property('unmetServices')
				.that.deep.equals(['service2']);
		});

		describe('Optional containers', () => {
			it('should correctly run passing optional containers', async () => {
				const {
					valid,
					unmetServices,
					fulfilledServices,
				} = await containerContractsFulfilled({
					service1: {
						contract: {
							type: 'sw.container',
							slug: 'service1',
							requires: [
								{
									type: 'sw.supervisor',
									version: `<${supervisorVersionGreater}`,
								},
							],
						},
						optional: true,
					},
				});
				expect(valid).to.equal(true);
				expect(unmetServices).to.deep.equal([]);
				expect(fulfilledServices).to.deep.equal(['service1']);
			});

			it('should corrrectly omit failing optional containers', async () => {
				const {
					valid,
					unmetServices,
					fulfilledServices,
				} = await containerContractsFulfilled({
					service1: {
						contract: {
							type: 'sw.container',
							slug: 'service1',
							requires: [
								{
									type: 'sw.supervisor',
									version: `>${supervisorVersionGreater}`,
								},
							],
						},
						optional: true,
					},
					service2: {
						contract: {
							type: 'sw.container',
							slug: 'service2',
						},
						optional: false,
					},
				});
				expect(valid).to.equal(true);
				expect(unmetServices).to.deep.equal(['service1']);
				expect(fulfilledServices).to.deep.equal(['service2']);
			});
		});
	});
});

describe('L4T version detection', () => {
	it('should correctly parse L4T version strings', async () => {
		let execStub = stub(child_process, 'exec').returns(
			Promise.resolve([
				Buffer.from('4.9.140-l4t-r32.2+g3dcbed5'),
				Buffer.from(''),
			]),
		);

		expect(await osRelease.getL4tVersion()).to.equal('32.2');
		expect(execStub.callCount).to.equal(1);

		execStub.restore();

		execStub = stub(child_process, 'exec').returns(
			Promise.resolve([
				Buffer.from('4.4.38-l4t-r28.2+g174510d'),
				Buffer.from(''),
			]),
		);
		expect(await osRelease.getL4tVersion()).to.equal('28.2');
		expect(execStub.callCount).to.equal(1);
		execStub.restore();
	});

	it('should return undefined when there is no l4t string in uname', async () => {
		const execStub = stub(child_process, 'exec').returns(
			Promise.resolve([Buffer.from('4.18.14-yocto-standard'), Buffer.from('')]),
		);

		expect(await osRelease.getL4tVersion()).to.be.undefined;
		execStub.restore();
	});
});
