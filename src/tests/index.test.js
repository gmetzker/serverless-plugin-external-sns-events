'use strict';

var expect = require('expect.js'),
    Plugin = require('../index.js'),
    BbPromise = require('bluebird'),
    sinon = require('sinon');

describe('serverless-plugin-external-sns-events', function() {

   function createMockServerless(requestFunc) {

      var serverless, provider;

      provider = {
         request: requestFunc
      };

      serverless = {
         getProvider: function(providerName) {

            if (providerName !== 'aws') {
               return null;
            }

            return provider;
         },
         service: {
            provider: {
               compiledCloudFormationTemplate: {
                  Resources: {}
               }
            }
         },
         cli: { log: function() {
            return;
         } }
         // cli: { log: function(val) {
         //    process.stdout.write(val + '\n');
         // } }
      };

      return serverless;

   }

   function createMockRequest(requestStub) {

      return function() {

         var reqArgs = Array.prototype.slice.call(arguments);


         return new BbPromise(function(resolve, reject) {
            var result;

            result = requestStub.apply(undefined, reqArgs);
            if (result !== null) {
               resolve(result);
               return;
            }

            reject(new Error('Call to request() with unexpected arguments:  ' +
            JSON.stringify(reqArgs)));

         });

      };

   }

   function isPromise(obj) {
      return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function';
   }

   describe('addEventPermission', function() {

      it('can compile lambda permission with correct FunctionName and SourceArn', function() {

         // ARRANGE:

         var plugin, mockServerless, spyRequestFunc, expPerm, expResourceName,
             actualPerm,
             topicName = 'cool-Topic',
             functionName = 'myFunc';

         mockServerless = createMockServerless(createMockRequest(sinon.stub()));
         spyRequestFunc = sinon.spy(mockServerless.getProvider('aws'), 'request');

         plugin = new Plugin(mockServerless, { });


         // ACT:
         plugin.addEventPermission(functionName, { name: functionName }, topicName);


         // ASSERT:

         expect(spyRequestFunc.callCount).to.be(0);

         expect(Object.keys(mockServerless.service.provider.compiledCloudFormationTemplate.Resources).length).to.be(1);

         expResourceName = 'MyFuncLambdaPermissionCoolTopic';

         expect(expResourceName in mockServerless.service.provider.compiledCloudFormationTemplate.Resources).to.be(true);

         actualPerm = mockServerless.service.provider.compiledCloudFormationTemplate.Resources[expResourceName];

         expPerm = {
            Type: 'AWS::Lambda::Permission',
            Properties: {
               FunctionName: { 'Fn::GetAtt': [ 'MyFuncLambdaFunction', 'Arn' ] },
               Action: 'lambda:InvokeFunction',
               Principal: 'sns.amazonaws.com',
               SourceArn: { 'Fn::Join': [ ':', [ 'arn:aws:sns', { 'Ref': 'AWS::Region' }, { 'Ref': 'AWS::AccountId' }, 'cool-Topic' ] ] }
            },
         };

         expect(actualPerm).to.eql(expPerm);

      });

   });

   describe('_getSubscriptionInfo', function() {

      it('can return SNS Subscription info when subscription exists', function() {

         // ARRANGE:
         var mockServerless, requestMethod, actual, requestStub, plugin, lambdaArn, topicArn,
             account = '12349',
             topicName = 'cooltopic',
             functionName = 'myFunc',
             stage = 'test1',
             region = 'us-west-42',
             subscriptionArn = 'arn:aws:sns:correct';

         lambdaArn = 'arn:aws:lambda:' + region + ':' + account + ':function:' + functionName;
         topicArn = 'arn:aws:sns:' + region + ':' + account + ':' + topicName;

         requestStub = sinon.stub();
         requestStub.withArgs('Lambda', 'getFunction', { FunctionName: functionName }, stage, region)
            .returns({ Configuration: { FunctionArn: lambdaArn } });

         requestStub.withArgs('SNS', 'listSubscriptionsByTopic', { TopicArn: topicArn }, stage, region)
            .returns({
               Subscriptions: [
                  { Protocol: 'other', Endpoint: lambdaArn, SubscriptionArn: 'junk' },
                  { Protocol: 'lambda', Endpoint: lambdaArn, SubscriptionArn: subscriptionArn },
                  { Protocol: 'lambda', Endpoint: 'wronglambda', SubscriptionArn: 'junksub' },
               ]
            });

         mockServerless = createMockServerless(createMockRequest(requestStub));

         requestMethod = sinon.spy(mockServerless.getProvider('aws'), 'request');

         plugin = new Plugin(mockServerless, { stage: stage, region: region });


         // ACT:
         actual = plugin._getSubscriptionInfo({ name: functionName }, topicName);


         // ASSERT:

         expect(isPromise(actual)).to.be(true);

         return actual.then(function(result) {

            expect(requestMethod.callCount).to.be(2);
            expect(result).to.eql({
               FunctionArn: lambdaArn,
               TopicArn: topicArn,
               SubscriptionArn: subscriptionArn
            });
         });


      });

      it('can return undefined Subscription info when subscription does NOT exist', function() {

         // ARRANGE:
         var mockServerless, requestMethod, actual, requestStub, plugin, lambdaArn, topicArn,
             account = '12349',
             topicName = 'cooltopic',
             functionName = 'myFunc',
             stage = 'test1',
             region = 'us-west-42';

         lambdaArn = 'arn:aws:lambda:' + region + ':' + account + ':function:' + functionName;
         topicArn = 'arn:aws:sns:' + region + ':' + account + ':' + topicName;

         requestStub = sinon.stub();
         requestStub.withArgs('Lambda', 'getFunction', { FunctionName: functionName }, stage, region)
            .returns({ Configuration: { FunctionArn: lambdaArn } });

         requestStub.withArgs('SNS', 'listSubscriptionsByTopic', { TopicArn: topicArn }, stage, region)
            .returns({
               Subscriptions: [
                  { Protocol: 'other', Endpoint: lambdaArn, SubscriptionArn: 'junk' },
                  { Protocol: 'lambda', Endpoint: 'wronglambda', SubscriptionArn: 'junksub' },
               ]
            });

         mockServerless = createMockServerless(createMockRequest(requestStub));

         requestMethod = sinon.spy(mockServerless.getProvider('aws'), 'request');

         plugin = new Plugin(mockServerless, { stage: stage, region: region });


         // ACT:
         actual = plugin._getSubscriptionInfo({ name: functionName }, topicName);


         // ASSERT:

         expect(isPromise(actual)).to.be(true);

         return actual.then(function(result) {

            expect(requestMethod.callCount).to.be(2);
            expect(result).to.eql({
               FunctionArn: lambdaArn,
               TopicArn: topicArn,
               SubscriptionArn: undefined
            });
         });


      });


   });

   describe('subscribeFunction', function() {

      it('can exit early when noDeploy is true', function() {

         // ARRANGE:
         var requestStub, mockServerless, requestMethod, plugin, actual, spyGetSubscriptionInfo,
             stage = 'test1',
             region = 'us-west-42',
             topicName = 'cooltopic',
             functionName = 'myFunc';

         requestStub = sinon.stub();
         mockServerless = createMockServerless(createMockRequest(requestStub));
         requestMethod = sinon.spy(mockServerless.getProvider('aws'), 'request');

         plugin = new Plugin(mockServerless, { stage: stage, region: region, noDeploy: true });
         spyGetSubscriptionInfo = sinon.spy(plugin, '_getSubscriptionInfo');

         // ACT:
         actual = plugin.subscribeFunction(functionName, { name: functionName }, topicName);

         // ASSERT:
         expect(isPromise(actual)).to.be(false);
         expect(actual).to.be(undefined);
         expect(spyGetSubscriptionInfo.callCount).to.be(0);
         expect(requestMethod.callCount).to.be(0);

      });

      it('will not add the subscription if it already exists', function() {

         // ARRANGE:
         var requestStub, mockServerless, requestMethod, plugin, actual,
             stubGetSubscriptionInfo, funcDef,
             stage = 'test1',
             region = 'us-west-42',
             topicName = 'cooltopic',
             functionName = 'myFunc';

         requestStub = sinon.stub();
         mockServerless = createMockServerless(createMockRequest(requestStub));
         requestMethod = sinon.spy(mockServerless.getProvider('aws'), 'request');

         plugin = new Plugin(mockServerless, { stage: stage, region: region, noDeploy: false });
         stubGetSubscriptionInfo = sinon.stub(plugin, '_getSubscriptionInfo', function() {
            return BbPromise.resolve({
               FunctionArn: 'some-func-arn',
               TopicArn: 'some-topic-arn',
               SubscriptionArn: 'subscription-arn-here',
            });
         });
         funcDef = { name: functionName };

         // ACT:
         actual = plugin.subscribeFunction(functionName, funcDef, topicName);

         // ASSERT:

         expect(isPromise(actual)).to.be(true);

         return actual.then(function(result) {

            expect(stubGetSubscriptionInfo.callCount).to.be(1);
            expect(stubGetSubscriptionInfo.calledWithExactly(funcDef, topicName)).to.be(true);

            // Since we mocked getSubscriptionInfo and added a fake SubscriptionArn
            // then no subsequent requests should have been made to the provider.
            expect(requestMethod.callCount).to.be(0);

            expect(result).to.be(undefined);

         });

      });

      it('can add the subscription if it does NOT exist', function() {

         // ARRANGE:
         var requestStub, mockServerless, requestMethod, plugin, actual,
             stubGetSubscriptionInfo, funcDef, expSub,
             stage = 'test1',
             region = 'us-west-42',
             topicName = 'cooltopic',
             functionName = 'myFunc';

         requestStub = sinon.stub();
         mockServerless = createMockServerless(createMockRequest(requestStub));
         requestMethod = sinon.spy(mockServerless.getProvider('aws'), 'request');

         plugin = new Plugin(mockServerless, { stage: stage, region: region, noDeploy: false });
         stubGetSubscriptionInfo = sinon.stub(plugin, '_getSubscriptionInfo', function() {
            return BbPromise.resolve({
               FunctionArn: 'some-func-arn',
               TopicArn: 'some-topic-arn',
               SubscriptionArn: undefined
            });
         });
         funcDef = { name: functionName };

         // ACT:
         actual = plugin.subscribeFunction(functionName, funcDef, topicName);

         // ASSERT:

         expect(isPromise(actual)).to.be(true);

         return actual.then(function(result) {

            expect(stubGetSubscriptionInfo.callCount).to.be(1);
            expect(stubGetSubscriptionInfo.calledWithExactly(funcDef, topicName)).to.be(true);

            // Since we mocked getSubscriptionInfo then we will only expect
            // a single call to request, that is to add the subscription.
            expect(requestMethod.callCount).to.be(1);

            expSub = {
               TopicArn: 'some-topic-arn',
               Protocol: 'lambda',
               Endpoint: 'some-func-arn'
            };

            expect(requestMethod.calledWithExactly('SNS', 'subscribe', expSub, stage, region))
               .to
               .be(true);


            expect(result).to.be(undefined);

         });

      });

   });

   describe('unsubscribeFunction', function() {

      it('will not unsubscribe if subscription does not exist', function() {

         // ARRANGE:
         var requestStub, mockServerless, plugin, actual, requestMethod,
             stubGetSubscriptionInfo, funcDef,
             stage = 'test1',
             region = 'us-west-42',
             topicName = 'cooltopic',
             functionName = 'myFunc';

         requestStub = sinon.stub();
         mockServerless = createMockServerless(createMockRequest(requestStub));
         requestMethod = sinon.spy(mockServerless.getProvider('aws'), 'request');

         plugin = new Plugin(mockServerless, { stage: stage, region: region, noDeploy: false });
         stubGetSubscriptionInfo = sinon.stub(plugin, '_getSubscriptionInfo', function() {
            return BbPromise.resolve({
               FunctionArn: 'some-func-arn',
               TopicArn: 'some-topic-arn',
               SubscriptionArn: undefined
            });
         });
         funcDef = { name: functionName };

         // ACT:
         actual = plugin.unsubscribeFunction(functionName, funcDef, topicName);

         // ASSERT:

         expect(isPromise(actual)).to.be(true);

         return actual.then(function() {

            expect(stubGetSubscriptionInfo.callCount).to.be(1);
            expect(stubGetSubscriptionInfo.calledWithExactly(funcDef, topicName)).to.be(true);

            // Since we mocked getSubscriptionInfo to find no existing
            // subscriptions then we will not expect any direct calls to
            // the request method.
            expect(requestMethod.callCount).to.be(0);

         });


      });

      it('can unsubscribe if subscription exist', function() {

         // ARRANGE:
         var requestStub, mockServerless, plugin, actual, requestMethod,
             stubGetSubscriptionInfo, funcDef, params,
             stage = 'test1',
             region = 'us-west-42',
             topicName = 'cooltopic',
             functionName = 'myFunc';

         requestStub = sinon.stub();
         mockServerless = createMockServerless(createMockRequest(requestStub));
         requestMethod = sinon.spy(mockServerless.getProvider('aws'), 'request');

         plugin = new Plugin(mockServerless, { stage: stage, region: region, noDeploy: false });
         stubGetSubscriptionInfo = sinon.stub(plugin, '_getSubscriptionInfo', function() {
            return BbPromise.resolve({
               FunctionArn: 'some-func-arn',
               TopicArn: 'some-topic-arn',
               SubscriptionArn: 'some-subscription-arn'
            });
         });
         funcDef = { name: functionName };


         // ACT:
         actual = plugin.unsubscribeFunction(functionName, funcDef, topicName);


         // ASSERT:
         expect(isPromise(actual)).to.be(true);

         return actual.then(function() {

            expect(stubGetSubscriptionInfo.callCount).to.be(1);
            expect(stubGetSubscriptionInfo.calledWithExactly(funcDef, topicName)).to.be(true);

            // Since we mocked getSubscriptionInfo we should
            // only have one call to the request (to remove the subscription)
            expect(requestMethod.callCount).to.be(1);

            params = {
               SubscriptionArn: 'some-subscription-arn'
            };

            expect(requestMethod.calledWithExactly('SNS', 'unsubscribe', params, stage, region))
               .to
               .be(true);

         });


      });

   });

   describe('_normalize', function() {
      var plugin = new Plugin();

      it('returns undefined for empty strings', function() {
         expect(plugin._normalize('')).to.be(undefined);
         expect(plugin._normalize(false)).to.be(undefined);
         expect(plugin._normalize()).to.be(undefined);
         expect(plugin._normalize('', true)).to.be(undefined);
         expect(plugin._normalize(false, true)).to.be(undefined);
         expect(plugin._normalize(undefined, true)).to.be(undefined);
      });

      it('only modifies the first letter', function() {
         expect(plugin._normalize('someTHING')).to.eql('SomeTHING');
         expect(plugin._normalize('SomeTHING')).to.eql('SomeTHING');
         expect(plugin._normalize('s')).to.eql('S');
         expect(plugin._normalize('S')).to.eql('S');
      });

   });


   describe('_normalizeTopicName', function() {
      var plugin = new Plugin();

      it('produces expected output for a string', function() {
         expect(plugin._normalizeTopicName('foo-topic')).to
            .eql('Footopic');
      });

   });

});
